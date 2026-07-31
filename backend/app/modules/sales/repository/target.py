import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.sales.models.target import Target


class TargetRepository(BaseRepository[Target]):
    model = Target

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Target | None:
        result = await self.db.execute(
            select(Target).where(Target.id == id, Target.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, period: str | None = None, offset: int = 0, limit: int = 50) -> list[Target]:
        stmt = select(Target).where(Target.tenant_id == tenant_id)
        if period:
            stmt = stmt.where(Target.period == period)
        stmt = stmt.order_by(Target.period.desc(), Target.name).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Target).where(Target.tenant_id == tenant_id)
        )
        return result.scalar_one()
