import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.order_payment import OrderPayment


def _with_relations():
    return [
        selectinload(Order.customer),
        selectinload(Order.items).selectinload(OrderItem.product),
        selectinload(Order.payments).selectinload(OrderPayment.receiver),
    ]


def _payment_status_filter(stmt, payment_status: str | None, today: date):
    if payment_status == "Unpaid":
        return stmt.where(Order.amount_paid <= 0)
    if payment_status == "PartiallyPaid":
        return stmt.where(Order.amount_paid > 0, Order.amount_paid < Order.total)
    if payment_status == "Paid":
        return stmt.where(Order.amount_paid >= Order.total)
    if payment_status == "Overdue":
        return stmt.where(
            Order.due_date.isnot(None), Order.due_date < today, Order.amount_paid < Order.total,
        )
    return stmt


class OrderRepository(BaseRepository[Order]):
    model = Order

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Order | None:
        result = await self.db.execute(
            select(Order).options(*_with_relations())
            .where(Order.id == id, Order.tenant_id == tenant_id)
            # populate_existing: this is called to re-fetch an Order right
            # after inserting a sibling row (e.g. a new OrderPayment) in the
            # same session — without this, SQLAlchemy's identity map would
            # hand back the Order instance with its `payments` collection
            # still cached from before that insert, silently hiding the row
            # that was just committed.
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        status: str | None = None,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
        payment_status: str | None = None,
    ) -> list[Order]:
        stmt = select(Order).options(*_with_relations()).where(Order.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Order.status == status)
        if search:
            like = f"%{search}%"
            stmt = stmt.outerjoin(Customer, Order.customer_id == Customer.id).where(
                or_(Order.order_number.ilike(like), Customer.name.ilike(like))
            )
        stmt = _payment_status_filter(stmt, payment_status, datetime.now(UTC).date())
        stmt = stmt.order_by(Order.ordered_at.desc()).offset(offset).limit(limit).execution_options(populate_existing=True)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(
        self,
        tenant_id: uuid.UUID,
        status: str | None = None,
        search: str | None = None,
        payment_status: str | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(Order).where(Order.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Order.status == status)
        if search:
            like = f"%{search}%"
            stmt = stmt.outerjoin(Customer, Order.customer_id == Customer.id).where(
                or_(Order.order_number.ilike(like), Customer.name.ilike(like))
            )
        stmt = _payment_status_filter(stmt, payment_status, datetime.now(UTC).date())
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

    async def list_for_customer(self, tenant_id: uuid.UUID, customer_id: uuid.UUID) -> list[Order]:
        result = await self.db.execute(
            select(Order).options(*_with_relations())
            .where(Order.tenant_id == tenant_id, Order.customer_id == customer_id)
            .order_by(Order.ordered_at.desc())
            .execution_options(populate_existing=True)
        )
        return list(result.scalars().all())

    async def receivables_summary(self, tenant_id: uuid.UUID) -> dict:
        """Aggregate outstanding-balance figures for the Accounting >
        Receivables view — computed straight from Order.amount_paid/total/
        due_date, the same ground truth every other view reads, never a
        separately-maintained number."""
        today = datetime.now(UTC).date()
        outstanding = Order.total - Order.amount_paid
        unpaid_condition = (
            Order.tenant_id == tenant_id, Order.status == "Completed", Order.amount_paid < Order.total,
        )

        result = await self.db.execute(
            select(func.coalesce(func.sum(outstanding), 0)).where(*unpaid_condition)
        )
        total_receivables = float(result.scalar_one() or 0)

        result = await self.db.execute(
            select(func.coalesce(func.sum(outstanding), 0))
            .where(*unpaid_condition, Order.due_date.isnot(None), Order.due_date < today)
        )
        overdue_receivables = float(result.scalar_one() or 0)

        result = await self.db.execute(
            select(func.count()).where(*unpaid_condition, Order.amount_paid > 0)
        )
        partially_paid_count = result.scalar_one()

        result = await self.db.execute(
            select(func.count()).where(*unpaid_condition, Order.amount_paid <= 0)
        )
        unpaid_count = result.scalar_one()

        return {
            "total_receivables": round(total_receivables, 2),
            "overdue_receivables": round(overdue_receivables, 2),
            "partially_paid_count": partially_paid_count,
            "unpaid_count": unpaid_count,
        }
