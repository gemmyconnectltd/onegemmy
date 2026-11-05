"""Sales by salesperson: totals per person and the actual orders behind them.

Definitions (also returned with the report so nobody has to guess):
- Sales: Completed orders in the period, VAT included, in the business currency. Draft, awaiting-approval, rejected and archived sales are never counted.
- Returns: Approved returns against those orders.
- Net sales: sales minus returns.
- Collected: payments applied to the orders. Outstanding: sales minus collected. These are separate figures, never added together.
- Awaiting approval is reported on its own line and is not revenue.
"""
import uuid
from datetime import date

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.modules.inventory.models.product import Product
from app.modules.reporting.service.breakdowns import _setup, can
from app.modules.reporting.service.performance import REFUND, SALES, money
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.return_ import Return
from app.modules.sales.models.target import Target
from app.modules.tenants.models import User

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_RATE = func.coalesce(Order.exchange_rate, 1)
COLLECTED = Order.amount_paid * _RATE
SELLER = func.coalesce(Order.salesperson_id, Order.created_by)

DEFINITIONS = {
    "sales": "Completed sales in the period, VAT included.",
    "returns": "Approved returns against those sales.",
    "net_sales": "Sales minus returns.",
    "collected": "Money received against those sales. Not the same as sales.",
    "outstanding": "Sales minus collected: still owed by customers.",
    "awaiting_approval": "Sales held for approval. Not counted as sales until approved.",
}


def _scope(user: User, requested: uuid.UUID | None, can_team: bool) -> uuid.UUID | None:
    """Without team access a person sees only their own figures, whatever they ask for."""
    if can_team:
        return requested
    if requested not in (None, user.id):
        raise ForbiddenError("You can only see your own sales figures")
    return user.id


def _filters(stmt, *, customer_id, product_id, category_id, payment_status, status):
    if customer_id:
        stmt = stmt.where(Order.customer_id == customer_id)
    if product_id or category_id:
        match = select(OrderItem.id).join(Product, Product.id == OrderItem.product_id).where(OrderItem.order_id == Order.id)
        if product_id:
            match = match.where(OrderItem.product_id == product_id)
        if category_id:
            match = match.where(Product.category_id == category_id)
        stmt = stmt.where(exists(match))
    if payment_status == "Unpaid":
        stmt = stmt.where(Order.amount_paid <= 0)
    elif payment_status == "PartiallyPaid":
        stmt = stmt.where(Order.amount_paid > 0, Order.amount_paid < Order.total)
    elif payment_status == "Paid":
        stmt = stmt.where(Order.amount_paid >= Order.total)
    return stmt


async def salespeople_report(db: AsyncSession, user: User, start: date | None, end: date | None, branch_id: uuid.UUID | None, *,
                             salesperson_id: uuid.UUID | None = None, customer_id: uuid.UUID | None = None, product_id: uuid.UUID | None = None,
                             category_id: uuid.UUID | None = None, payment_status: str | None = None, include_rows: bool = True,
                             limit: int = 200) -> dict:
    team = can(user, "orders:approve")
    wanted = _scope(user, salesperson_id, team)
    tenant, branches, start, end, report = await _setup(db, user, start, end, branch_id, "orders:read")
    s, e = report.window(start, end)

    def base(stmt, completed: bool = True):
        stmt = stmt.where(Order.tenant_id == tenant.id, Order.archived_at.is_(None), Order.ordered_at >= s, Order.ordered_at < e,
                          Order.status == ("Completed" if completed else "Awaiting Approval"))
        if branches is not None:
            stmt = stmt.where(Order.branch_id.in_(branches))
        if wanted:
            stmt = stmt.where(SELLER == wanted)
        return _filters(stmt, customer_id=customer_id, product_id=product_id, category_id=category_id, payment_status=payment_status, status=None)

    totals = (await db.execute(base(select(SELLER, func.count(Order.id), func.coalesce(func.sum(SALES), 0), func.coalesce(func.sum(COLLECTED), 0))
                                    .group_by(SELLER)))).all()
    returned = dict((await db.execute(
        select(SELLER, func.coalesce(func.sum(REFUND), 0)).select_from(Return).join(Order, Order.id == Return.order_id)
        .where(Return.status == "Approved", Return.id.is_not(None)).where(Order.id.in_(base(select(Order.id)))).group_by(SELLER))).all())
    waiting = {r[0]: (r[1], r[2]) for r in (await db.execute(
        base(select(SELLER, func.count(Order.id), func.coalesce(func.sum(SALES), 0)).group_by(SELLER), completed=False))).all()}

    ids = {r[0] for r in totals} | set(waiting)
    names = {}
    if ids:
        names = {u.id: u.full_name for u in (await db.execute(select(User).where(User.tenant_id == tenant.id, User.id.in_([i for i in ids if i])))).scalars()}
    people, grand = [], {"orders": 0, "sales": 0.0, "returns": 0.0, "net_sales": 0.0, "collected": 0.0, "outstanding": 0.0}
    for sid, count, sales, collected in totals:
        ret, sales, collected = money(returned.get(sid, 0)), money(sales), money(collected)
        row = {"salesperson_id": sid, "salesperson": names.get(sid, "Not recorded"), "orders": int(count), "sales": sales, "returns": ret,
               "net_sales": round(sales - ret, 2), "collected": collected, "outstanding": round(max(sales - collected, 0), 2),
               "awaiting_approval": {"orders": int(waiting.get(sid, (0, 0))[0]), "value": money(waiting.get(sid, (0, 0))[1])}}
        people.append(row)
        for key, running in grand.items():
            grand[key] = round(running + row[key], 2)
    people.sort(key=lambda r: r["net_sales"], reverse=True)

    out = {"from_date": start, "to_date": end, "currency": tenant.currency, "definitions": DEFINITIONS, "people": people, "totals": grand,
           "targets": await _targets(db, tenant.id, people, start)}
    if include_rows:
        rows = (await db.execute(base(select(Order, Customer.name).outerjoin(Customer, Customer.id == Order.customer_id))
                                 .order_by(Order.ordered_at.desc()).limit(limit))).all()
        refunds = dict((await db.execute(select(Return.order_id, func.coalesce(func.sum(REFUND), 0)).where(
            Return.status == "Approved", Return.order_id.in_([o.id for o, _ in rows] or [None])).group_by(Return.order_id))).all())
        out["orders"] = [{
            "id": o.id, "order_number": o.order_number, "date": o.ordered_at, "customer": cust, "salesperson_id": o.salesperson_id or o.created_by,
            "salesperson": names.get(o.salesperson_id or o.created_by), "entered_by": o.created_by, "approved_by": o.approved_by,
            "approval_status": "Approved" if o.approved_by else "Not required", "gross": money(o.base_subtotal if o.base_subtotal is not None else o.subtotal),
            "discount": money(o.base_discount if o.base_discount is not None else o.discount), "total": money(o.base_total if o.base_total is not None else o.total),
            "returns": money(refunds.get(o.id, 0)), "collected": money(float(o.amount_paid) * float(o.exchange_rate or 1)),
            "outstanding": money(max(float(o.base_total if o.base_total is not None else o.total) - float(o.amount_paid) * float(o.exchange_rate or 1), 0)),
            "items": [{"name": i.product_name, "quantity": float(i.quantity)} for i in o.items],
        } for o, cust in rows]
    return out

async def _targets(db: AsyncSession, tenant_id: uuid.UUID, people: list[dict], start: date) -> list[dict]:
    """Targets assigned to a person, against what that person actually sold in the target's month. Nothing is invented for people without one."""
    period = f"{_MONTHS[start.month - 1]} {start.year}"
    found = (await db.execute(select(Target).where(Target.tenant_id == tenant_id, Target.period == period, Target.assigned_to.is_not(None)))).scalars().all()
    actual = {p["salesperson_id"]: p for p in people}
    out = []
    for t in found:
        mine = actual.get(t.assigned_to)
        value = (mine["net_sales"] if t.unit == "currency" else mine["orders"]) if mine else 0
        out.append({"id": t.id, "name": t.name, "salesperson_id": t.assigned_to, "unit": t.unit, "period": t.period, "target": float(t.target_value),
                    "actual": value, "progress": round(value / float(t.target_value) * 100, 1) if float(t.target_value) else None})
    return out
