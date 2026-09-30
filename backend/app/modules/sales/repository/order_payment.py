import uuid

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import joinedload

from app.core.repository import BaseRepository
from app.modules.sales.models.order_payment import OrderPayment


class OrderPaymentRepository(BaseRepository[OrderPayment]):
    model = OrderPayment

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> OrderPayment | None:
        result = await self.db.execute(
            select(OrderPayment)
            .options(joinedload(OrderPayment.receiver), joinedload(OrderPayment.reverser))
            .where(OrderPayment.id == id, OrderPayment.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_order(self, tenant_id: uuid.UUID, order_id: uuid.UUID) -> list[OrderPayment]:
        result = await self.db.execute(
            select(OrderPayment)
            .options(joinedload(OrderPayment.receiver), joinedload(OrderPayment.reverser))
            .where(OrderPayment.tenant_id == tenant_id, OrderPayment.order_id == order_id)
            .order_by(OrderPayment.paid_at.desc())
        )
        return list(result.unique().scalars().all())

    async def list_for_customer(self, tenant_id: uuid.UUID, customer_id: uuid.UUID) -> list[OrderPayment]:
        result = await self.db.execute(
            select(OrderPayment)
            .options(joinedload(OrderPayment.receiver))
            .where(
                OrderPayment.tenant_id == tenant_id,
                OrderPayment.customer_id == customer_id,
                OrderPayment.status == "Completed",
            )
            .order_by(OrderPayment.paid_at)
        )
        return list(result.unique().scalars().all())

    async def find_by_client_payment_id(self, tenant_id: uuid.UUID, client_payment_id: str) -> OrderPayment | None:
        result = await self.db.execute(
            select(OrderPayment)
            .options(joinedload(OrderPayment.receiver))
            .where(OrderPayment.tenant_id == tenant_id, OrderPayment.client_payment_id == client_payment_id)
        )
        return result.unique().scalar_one_or_none()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.max(cast(func.substring(OrderPayment.reference, 5), Integer)))
            .where(OrderPayment.tenant_id == tenant_id)
        )
        current_max = result.scalar_one() or 0
        return f"PAY-{str(current_max + 1).zfill(4)}"
