"""Sales History figures for the whole filter (not just the page shown), in the business's base currency.

One query each for the money and the status counts, using the same filters as the list (repository.order.apply_filters), so the
cards, the tabs and the table always describe the same sales. Money counts completed sales only: a pending, held or cancelled sale
is not revenue.
"""
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.period import DatePeriod
from app.modules.sales.models.order import Order
from app.modules.sales.repository.order import apply_filters

ZERO = Decimal(0)


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


async def _money_figures(db: AsyncSession, tenant_id: uuid.UUID, **filters) -> dict:
    rate = func.coalesce(Order.exchange_rate, 1)
    total = func.coalesce(Order.base_total, Order.total * rate)
    paid = Order.amount_paid * rate
    owed = case((Order.amount_paid < Order.total, (Order.total - Order.amount_paid) * rate), else_=0)
    today = datetime.now(UTC).date()
    overdue = (Order.due_date.isnot(None)) & (Order.due_date < today) & (Order.amount_paid < Order.total)
    stmt = apply_filters(select(
        func.count(), func.coalesce(func.sum(total), 0), func.coalesce(func.sum(func.coalesce(Order.base_tax, Order.tax * rate)), 0),
        func.coalesce(func.sum(paid), 0), func.coalesce(func.sum(owed), 0),
        func.count().filter(Order.amount_paid < Order.total), func.count().filter(overdue),
    ).select_from(Order), tenant_id, status="Completed", **filters)
    count, sales, tax, collected, outstanding, owing, overdue_count = (await db.execute(stmt)).one()
    sales = _money(sales)
    return {"sales": sales, "count": int(count), "tax": _money(tax), "net": sales - _money(tax), "collected": _money(collected),
            "collected_share": round(float(_money(collected) / sales * 100), 1) if sales else None,
            "outstanding": _money(outstanding), "outstanding_count": int(owing), "overdue_count": int(overdue_count),
            "average": (sales / count).quantize(Decimal("0.01")) if count else ZERO}


def _previous(period: DatePeriod | None) -> DatePeriod | None:
    """The same number of days just before the chosen period (for "vs last period"); None when no dates are chosen."""
    if period is None or period.from_date is None:
        return None
    end = period.to_date or datetime.now(UTC).date()
    days = (end - period.from_date).days + 1
    return DatePeriod(from_date=period.from_date - timedelta(days=days), to_date=period.from_date - timedelta(days=1), timezone=period.timezone)


async def order_summary(db: AsyncSession, tenant_id: uuid.UUID, *, search: str | None = None, branch_id: uuid.UUID | None = None,
                        period: DatePeriod | None = None, salesperson_id: uuid.UUID | None = None, payment_method: str | None = None) -> dict:
    filters = {"search": search, "branch_id": branch_id, "period": period, "salesperson_id": salesperson_id, "payment_method": payment_method}
    money = await _money_figures(db, tenant_id, **filters)
    previous = _previous(period)
    before = await _money_figures(db, tenant_id, **{**filters, "period": previous}) if previous else None
    today = datetime.now(UTC).date()
    completed = Order.status == "Completed"
    counts = (await db.execute(apply_filters(select(
        func.count(),
        func.count().filter(completed),
        func.count().filter(Order.status == "Pending"),
        func.count().filter(Order.status == "Awaiting Approval"),
        func.count().filter(Order.status.in_(("Cancelled", "Rejected"))),
        func.count().filter(completed & (Order.amount_paid <= 0)),
        func.count().filter(completed & (Order.amount_paid > 0) & (Order.amount_paid < Order.total)),
        func.count().filter(completed & Order.due_date.isnot(None) & (Order.due_date < today) & (Order.amount_paid < Order.total)),
    ).select_from(Order), tenant_id, **filters))).one()
    archived = (await db.execute(apply_filters(select(func.count()).select_from(Order), tenant_id, archived=True, **filters))).scalar_one()
    keys = ("all", "completed", "pending", "awaiting_approval", "cancelled", "unpaid", "partly_paid", "overdue")
    return {**money, "previous_average": before["average"] if before else None, "previous_sales": before["sales"] if before else None,
            "counts": {**dict(zip(keys, (int(c) for c in counts), strict=True)), "archived": int(archived)}}
