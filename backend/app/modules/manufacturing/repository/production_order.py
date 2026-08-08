import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.manufacturing.models.production_order import ProductionOrder


class ProductionOrderRepository(BaseRepository[ProductionOrder]):
    model = ProductionOrder

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductionOrder | None:
        result = await self.db.execute(
            select(ProductionOrder)
            .options(selectinload(ProductionOrder.items))
            .where(ProductionOrder.id == id, ProductionOrder.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[ProductionOrder]:
        result = await self.db.execute(
            select(ProductionOrder)
            .options(selectinload(ProductionOrder.items))
            .where(ProductionOrder.tenant_id == tenant_id)
            .order_by(ProductionOrder.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(ProductionOrder).where(ProductionOrder.tenant_id == tenant_id)
        )
        return result.scalar_one()

    async def next_order_number(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.count()).select_from(ProductionOrder).where(ProductionOrder.tenant_id == tenant_id)
        )
        count = result.scalar_one()
        return f"WO-{count + 1:04d}"
