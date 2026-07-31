import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.sales.models.return_ import Return
from app.modules.sales.models.return_item import ReturnItem


def _with_relations():
    return [
        selectinload(Return.customer),
        selectinload(Return.order),
        selectinload(Return.items).selectinload(ReturnItem.product),
    ]


class ReturnRepository(BaseRepository[Return]):
    model = Return

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Return | None:
        result = await self.db.execute(
            select(Return).options(*_with_relations())
            .where(Return.id == id, Return.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[Return]:
        stmt = select(Return).options(*_with_relations()).where(Return.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Return.status == status)
        stmt = stmt.order_by(Return.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(Return).where(Return.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Return.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_return_number(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.count()).select_from(Return).where(Return.tenant_id == tenant_id)
        )
        count = result.scalar_one()
        return f"RET-{str(count + 1).zfill(4)}"
