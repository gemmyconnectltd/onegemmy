"""Branch Management read models: the directory with real per-branch numbers, one branch's sales, and its change history.

Nothing here stores anything and nothing invents a number:
  - sales use the same definition as the daily branch report (completed orders, `base_total`, the business's own timezone)
  - staff are people explicitly assigned to the branch (their own branch list or single branch); people with no branch limit
    work in every branch and are counted separately, never added to a branch
  - stock is not tracked per branch in PESAA (see DailyRepository's own note), so no branch stock figure is produced here
All queries are grouped aggregates over the tenant, never one query per branch.
"""
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.modules.audit.models import AuditLog
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.order_payment import OrderPayment
from app.modules.tenants.models import Branch, Tenant, User

MAX_DAYS = 366


def bounds(tenant: Tenant, start: date | None, end: date | None) -> tuple[date, date, datetime, datetime, ZoneInfo]:
    """The reporting period as dates plus the exact instants it covers in the business's timezone (default: this month so far)."""
    tz = ZoneInfo(tenant.timezone or "UTC")
    today = datetime.now(tz).date()
    end = end or today
    start = start or end.replace(day=1)
    if start > end or (end - start).days > MAX_DAYS:
        raise ValidationError("Choose a period of at most a year, starting before it ends")
    return start, end, datetime.combine(start, time.min, tz), datetime.combine(end + timedelta(days=1), time.min, tz), tz


def previous(start: date, end: date) -> tuple[date, date]:
    """The period of the same length that ends the day before this one starts, for growth comparisons."""
    days = (end - start).days + 1
    return start - timedelta(days=days), start - timedelta(days=1)


_RATE = func.coalesce(Order.exchange_rate, 1)
_SALES = func.coalesce(Order.base_total, Order.total * _RATE)


async def sales_by_branch(db: AsyncSession, tenant_id: uuid.UUID, begin: datetime, finish: datetime, branches: list[uuid.UUID] | None = None) -> dict:
    stmt = (select(Order.branch_id, func.coalesce(func.sum(_SALES), 0), func.count())
            .where(Order.tenant_id == tenant_id, Order.status == "Completed", Order.ordered_at >= begin, Order.ordered_at < finish)
            .group_by(Order.branch_id))
    if branches is not None:
        stmt = stmt.where(Order.branch_id.in_(branches))
    return {b: {"sales": Decimal(s), "orders": n} for b, s, n in (await db.execute(stmt)).all()}


def assigned_branches(branch_id, branch_ids) -> set[str] | None:
    """The branches a person is limited to, read the way get_active_branch_id reads them; None = every branch."""
    if branch_ids is not None:
        return {str(b) for b in branch_ids if b}
    return {str(branch_id)} if branch_id else None


async def staff_by_branch(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[dict[str, dict], int, int]:
    """Assigned people per branch ({branch id: {total, active}}), how many active people have no branch limit, and how many
    different active people are assigned to at least one branch (someone in two branches is one person)."""
    rows = (await db.execute(select(User.branch_id, User.branch_ids, User.is_active).where(User.tenant_id == tenant_id))).all()
    out: dict[str, dict] = {}
    everywhere = distinct = 0
    for branch_id, branch_ids, active in rows:
        mine = assigned_branches(branch_id, branch_ids)
        if mine is None:
            everywhere += 1 if active else 0
            continue
        distinct += 1 if active and mine else 0
        for b in mine:
            slot = out.setdefault(b, {"total": 0, "active": 0})
            slot["total"] += 1
            slot["active"] += 1 if active else 0
    return out, everywhere, distinct


async def directory(db: AsyncSession, tenant: Tenant, *, allowed: list[uuid.UUID] | None, search: str | None, status: str | None, sort: str, direction: str,
                    start: date | None, end: date | None, offset: int, limit: int, include_sales: bool = True) -> dict:
    start, end, begin, finish, _ = bounds(tenant, start, end)
    stmt = select(Branch).where(Branch.tenant_id == tenant.id)
    if allowed is not None:
        stmt = stmt.where(Branch.id.in_(allowed))
    branches = list((await db.execute(stmt)).scalars().all())
    ids = [b.id for b in branches]
    staff, everywhere, assigned = await staff_by_branch(db, tenant.id)
    now = await sales_by_branch(db, tenant.id, begin, finish, ids) if include_sales else {}
    needle = (search or "").strip().lower()
    rows = []
    for b in branches:
        if needle and needle not in f"{b.name} {b.location or ''} {b.email or ''} {b.phone or ''}".lower():
            continue
        if status and b.status != status:
            continue
        s, mine = now.get(b.id, {"sales": Decimal(0), "orders": 0}), staff.get(str(b.id), {"total": 0, "active": 0})
        rows.append({"id": str(b.id), "name": b.name, "location": b.location, "phone": b.phone, "email": b.email, "status": b.status, "is_main": b.is_main,
                     "created_at": b.created_at.isoformat() if b.created_at else None, "staff": mine["total"], "active_staff": mine["active"],
                     "sales": s["sales"] if include_sales else None, "orders": s["orders"] if include_sales else None})
    keys = {"name": lambda r: r["name"].lower(), "created": lambda r: r["created_at"] or "", "sales": lambda r: r["sales"] or 0, "staff": lambda r: r["staff"]}
    rows.sort(key=keys.get(sort, keys["name"]), reverse=direction == "desc")
    return {
        "items": rows[offset:offset + limit], "total": len(rows),
        "summary": {
            "total": len(branches), "active": sum(b.status == "active" for b in branches), "inactive": sum(b.status != "active" for b in branches),
            "assigned_staff": assigned, "works_in_all_branches": everywhere,
            "sales": sum((v["sales"] for v in now.values()), Decimal(0)) if include_sales else None, "orders": sum(v["orders"] for v in now.values()) if include_sales else None,
            "currency": tenant.currency, "from_date": start.isoformat(), "to_date": end.isoformat(),
        },
    }


async def branch_sales(db: AsyncSession, tenant: Tenant, branch_id: uuid.UUID, start: date | None, end: date | None) -> dict:
    start, end, begin, finish, tz = bounds(tenant, start, end)
    last_start, last_end = previous(start, end)
    last_begin, last_finish = datetime.combine(last_start, time.min, tz), datetime.combine(last_end + timedelta(days=1), time.min, tz)
    mine = [branch_id]
    now = (await sales_by_branch(db, tenant.id, begin, finish, mine)).get(branch_id, {"sales": Decimal(0), "orders": 0})
    before = (await sales_by_branch(db, tenant.id, last_begin, last_finish, mine)).get(branch_id, {"sales": Decimal(0), "orders": 0})
    within = (Order.tenant_id == tenant.id, Order.branch_id == branch_id, Order.status == "Completed", Order.ordered_at >= begin, Order.ordered_at < finish)

    day = cast(func.timezone(tenant.timezone or "UTC", Order.ordered_at), Date)
    trend = (await db.execute(select(day, func.coalesce(func.sum(_SALES), 0), func.count()).where(*within).group_by(day).order_by(day))).all()
    products = (await db.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total * _RATE))
        .join(Order, Order.id == OrderItem.order_id).where(*within).group_by(OrderItem.product_name)
        .order_by(func.sum(OrderItem.line_total * _RATE).desc()).limit(8)
    )).all()
    # One expression object reused for select, group and order, so the database sees the same bound value everywhere.
    method = func.coalesce(OrderPayment.payment_method, "other")
    paid = func.sum(func.coalesce(OrderPayment.base_amount, OrderPayment.amount * func.coalesce(OrderPayment.exchange_rate, 1)))
    methods = (await db.execute(
        select(method, func.coalesce(paid, 0))
        .where(OrderPayment.tenant_id == tenant.id, OrderPayment.branch_id == branch_id, OrderPayment.status == "Completed",
               OrderPayment.paid_at >= begin, OrderPayment.paid_at < finish)
        .group_by(method).order_by(paid.desc())
    )).all()
    recent = (await db.execute(
        select(Order.id, Order.order_number, _SALES, Order.ordered_at, Order.payment_method).where(*within).order_by(Order.ordered_at.desc()).limit(10)
    )).all()
    growth = None if before["sales"] == 0 else round(float((now["sales"] - before["sales"]) / before["sales"] * 100), 1)
    return {
        "currency": tenant.currency, "timezone": tenant.timezone, "from_date": start.isoformat(), "to_date": end.isoformat(),
        "previous": {"from_date": last_start.isoformat(), "to_date": last_end.isoformat(), "sales": before["sales"], "orders": before["orders"]},
        "sales": now["sales"], "orders": now["orders"], "average": (now["sales"] / now["orders"]) if now["orders"] else Decimal(0), "growth_pct": growth,
        "trend": [{"day": d.isoformat(), "sales": s, "orders": n} for d, s, n in trend],
        "top_products": [{"name": n, "quantity": q, "amount": a} for n, q, a in products],
        "payment_methods": [{"method": m, "amount": a} for m, a in methods],
        "recent_orders": [{"id": str(i), "number": num, "total": t, "at": at.isoformat() if at else None, "method": pm} for i, num, t, at, pm in recent],
        "definitions": "Sales are completed orders in the business's base currency, counted on the day they were ordered. Returns and refunds are not netted off here.",
    }


async def branch_activity(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID, limit: int = 30) -> list[dict]:
    rows = (await db.execute(
        select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.entity_type == "branch", AuditLog.entity_id == str(branch_id))
        .order_by(AuditLog.created_at.desc()).limit(limit)
    )).scalars().all()
    return [{"id": str(r.id), "action": r.action, "summary": r.summary, "actor": r.actor_name, "changes": r.changes,
             "at": r.created_at.isoformat() if r.created_at else None} for r in rows]
