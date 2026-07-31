import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem


def _with_relations():
    return [
        selectinload(Order.customer),
        selectinload(Order.items).selectinload(OrderItem.product),
    ]


class OrderRepository(BaseRepository[Order]):
    model = Order

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Order | None:
        result = await self.db.execute(
            select(Order).options(*_with_relations())
            .where(Order.id == id, Order.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[Order]:
        stmt = select(Order).options(*_with_relations()).where(Order.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Order.status == status)
        stmt = stmt.order_by(Order.ordered_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Order.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_order_number(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id)
        )
        count = result.scalar_one()
        return f"ORD-{str(count + 1).zfill(4)}"
