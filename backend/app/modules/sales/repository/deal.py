import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.sales.models.deal import Deal


def _with_relations():
    return [selectinload(Deal.customer), selectinload(Deal.owner)]


class DealRepository(BaseRepository[Deal]):
    model = Deal

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Deal | None:
        result = await self.db.execute(
            select(Deal).options(*_with_relations())
            .where(Deal.id == id, Deal.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, stage: str | None = None, offset: int = 0, limit: int = 50) -> list[Deal]:
        stmt = select(Deal).options(*_with_relations()).where(Deal.tenant_id == tenant_id)
        if stage:
            stmt = stmt.where(Deal.stage == stage)
        stmt = stmt.order_by(Deal.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, stage: str | None = None) -> int:
        stmt = select(func.count()).select_from(Deal).where(Deal.tenant_id == tenant_id)
        if stage:
            stmt = stmt.where(Deal.stage == stage)
        result = await self.db.execute(stmt)
        return result.scalar_one()
