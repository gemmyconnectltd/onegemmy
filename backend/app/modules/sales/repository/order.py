import uuid

from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.sales.models.customer import Customer
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

    async def list_for_tenant(
        self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50, search: str | None = None
    ) -> list[Order]:
        stmt = select(Order).options(*_with_relations()).where(Order.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Order.status == status)
        if search:
            like = f"%{search}%"
            stmt = stmt.outerjoin(Customer, Order.customer_id == Customer.id).where(
                or_(Order.order_number.ilike(like), Customer.name.ilike(like))
            )
        stmt = stmt.order_by(Order.ordered_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, search: str | None = None) -> int:
        stmt = select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Order.status == status)
        if search:
            like = f"%{search}%"
            stmt = stmt.outerjoin(Customer, Order.customer_id == Customer.id).where(
                or_(Order.order_number.ilike(like), Customer.name.ilike(like))
            )
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def find_by_client_order_id(self, tenant_id: uuid.UUID, client_order_id: str) -> Order | None:
        result = await self.db.execute(
            select(Order).options(*_with_relations())
            .where(Order.tenant_id == tenant_id, Order.client_order_id == client_order_id)
        )
        return result.scalar_one_or_none()

    async def next_order_number(self, tenant_id: uuid.UUID) -> str:
        # MAX of the existing numeric suffix, not COUNT(*) — COUNT undercounts
        # (and collides with a still-existing higher number) as soon as any
        # order has ever been deleted for this tenant.
        result = await self.db.execute(
            select(func.max(cast(func.substring(Order.order_number, 5), Integer)))
            .where(Order.tenant_id == tenant_id)
        )
        current_max = result.scalar_one() or 0
        return f"ORD-{str(current_max + 1).zfill(4)}"
