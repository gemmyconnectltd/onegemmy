import uuid

from sqlalchemy import Integer, cast, func, select
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
        # MAX of the existing numeric suffix, not COUNT(*) — see order.py's
        # next_order_number for why COUNT collides once anything is deleted.
        result = await self.db.execute(
            select(func.max(cast(func.substring(Return.return_number, 5), Integer)))
            .where(Return.tenant_id == tenant_id)
        )
        current_max = result.scalar_one() or 0
        return f"RET-{str(current_max + 1).zfill(4)}"
