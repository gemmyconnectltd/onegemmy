import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.inventory.models.supplier import Supplier


class SupplierRepository(BaseRepository[Supplier]):
    model = Supplier

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Supplier | None:
        result = await self.db.execute(
            select(Supplier).where(Supplier.id == id, Supplier.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Supplier]:
        result = await self.db.execute(
            select(Supplier).where(Supplier.tenant_id == tenant_id).order_by(Supplier.name).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Supplier).where(Supplier.tenant_id == tenant_id)
        )
        return result.scalar_one()
