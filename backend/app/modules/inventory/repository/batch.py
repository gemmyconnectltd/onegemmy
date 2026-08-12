import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.inventory.models.batch import InventoryBatch


class BatchRepository(BaseRepository[InventoryBatch]):
    model = InventoryBatch

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> InventoryBatch | None:
        result = await self.db.execute(
            select(InventoryBatch).where(InventoryBatch.id == id, InventoryBatch.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, product_id: uuid.UUID | None,
                               expiring_in_days: int | None, offset: int, limit: int) -> list[InventoryBatch]:
        stmt = select(InventoryBatch).where(InventoryBatch.tenant_id == tenant_id)
        if product_id:
            stmt = stmt.where(InventoryBatch.product_id == product_id)
        if expiring_in_days is not None:
            from datetime import date, timedelta
            cutoff = date.today() + timedelta(days=expiring_in_days)
            stmt = stmt.where(InventoryBatch.expiry_date <= cutoff, InventoryBatch.expiry_date.isnot(None))
        stmt = stmt.order_by(InventoryBatch.expiry_date.asc().nullslast()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, product_id: uuid.UUID | None,
                                expiring_in_days: int | None) -> int:
        stmt = select(func.count()).select_from(InventoryBatch).where(InventoryBatch.tenant_id == tenant_id)
        if product_id:
            stmt = stmt.where(InventoryBatch.product_id == product_id)
        if expiring_in_days is not None:
            from datetime import date, timedelta
            cutoff = date.today() + timedelta(days=expiring_in_days)
            stmt = stmt.where(InventoryBatch.expiry_date <= cutoff, InventoryBatch.expiry_date.isnot(None))
        return (await self.db.execute(stmt)).scalar_one()

    async def get_by_batch_number(self, tenant_id: uuid.UUID, batch_number: str) -> InventoryBatch | None:
        result = await self.db.execute(
            select(InventoryBatch).where(
                InventoryBatch.tenant_id == tenant_id,
                InventoryBatch.batch_number == batch_number,
            )
        )
        return result.scalar_one_or_none()
