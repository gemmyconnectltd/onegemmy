import uuid

from sqlalchemy import func, select
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
        result = await self.db.execute(
            select(func.count()).select_from(StockTransfer).where(StockTransfer.tenant_id == tenant_id)
        )
        return f"TRF-{str(result.scalar_one() + 1).zfill(4)}"
