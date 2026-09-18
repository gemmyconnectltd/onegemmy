import uuid

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.inventory.models.transfer import StockTransfer


class TransferRepository(BaseRepository[StockTransfer]):
    model = StockTransfer

    def _with_relations(self):
        return [
            selectinload(StockTransfer.from_branch),
            selectinload(StockTransfer.to_branch),
            selectinload(StockTransfer.items),
        ]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> StockTransfer | None:
        result = await self.db.execute(
            select(StockTransfer)
            .options(*self._with_relations())
            .where(StockTransfer.id == id, StockTransfer.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 20
    ) -> list[StockTransfer]:
        stmt = select(StockTransfer).options(*self._with_relations()).where(StockTransfer.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(StockTransfer.status == status)
        stmt = stmt.order_by(StockTransfer.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(StockTransfer).where(StockTransfer.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(StockTransfer.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_transfer_number(self, tenant_id: uuid.UUID) -> str:
        # MAX of the existing numeric suffix, not COUNT(*) — see sales/order.py's
        # next_order_number for why COUNT collides once anything is deleted.
        result = await self.db.execute(
            select(func.max(cast(func.substring(StockTransfer.transfer_number, 5), Integer)))
            .where(StockTransfer.tenant_id == tenant_id)
        )
        current_max = result.scalar_one() or 0
        return f"TRF-{str(current_max + 1).zfill(4)}"
