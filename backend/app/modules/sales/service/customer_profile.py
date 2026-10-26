"""One customer, everything at once: contact details, sales, payments, returns and debts, read-only.

Each section needs its own read permission and a user without it simply gets that section back as null. Sales,
payments and debts follow the active branch; the customer record itself is tenant-wide."""
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.repository.debt import DebtRepository
from app.modules.accounting.service.workspace import encoded, resolve_branch
from app.modules.currency.service import get_base_currency
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.deal import Deal
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_payment import OrderPayment
from app.modules.sales.models.return_ import Return
from app.modules.tenants.models.user import User

SECTIONS = ("orders", "payments", "returns", "debts")
NEEDS = {"orders": "orders:read", "payments": "orders:read", "returns": "returns:read", "debts": "accounts_receivable:read"}
PREVIEW = 10


def can(user: User, permission: str) -> bool:
    return user.is_superuser or permission in user.permissions_names


async def _customer(db: AsyncSession, tenant: uuid.UUID, customer_id: uuid.UUID) -> Customer:
    customer = (await db.execute(select(Customer).where(Customer.tenant_id == tenant, Customer.id == customer_id))).scalar_one_or_none()
    if customer is None:
        raise NotFoundError("Customer not found")
    return customer


async def _rows(db: AsyncSession, section: str, tenant, customer_id, branch, currency, offset: int, limit: int) -> tuple[list[dict], int]:
    if section == "orders":
        where = [Order.tenant_id == tenant, Order.customer_id == customer_id]
        if branch:
            where.append(Order.branch_id == branch)
        total = await db.scalar(select(func.count()).select_from(Order).where(*where))
        q = select(Order.id, Order.order_number, Order.ordered_at, Order.status, Order.total, Order.amount_paid,
                   func.coalesce(Order.currency_code, currency).label("currency"), Order.due_date).where(*where).order_by(
            Order.ordered_at.desc(), Order.id).offset(offset).limit(limit)
    elif section == "payments":
        where = [OrderPayment.tenant_id == tenant, Order.customer_id == customer_id]
        if branch:
            where.append(Order.branch_id == branch)
        base = select(OrderPayment.id).join(Order, and_(Order.id == OrderPayment.order_id, Order.tenant_id == tenant)).where(*where)
        total = await db.scalar(select(func.count()).select_from(base.subquery()))
        q = select(OrderPayment.id, OrderPayment.reference, OrderPayment.paid_at, OrderPayment.amount, OrderPayment.payment_method,
                   OrderPayment.status, Order.order_number, func.coalesce(OrderPayment.currency_code, currency).label("currency")
                   ).join(Order, and_(Order.id == OrderPayment.order_id, Order.tenant_id == tenant)).where(*where).order_by(
            OrderPayment.paid_at.desc(), OrderPayment.id).offset(offset).limit(limit)
    elif section == "returns":
        where = [Return.tenant_id == tenant, Return.customer_id == customer_id]
        total = await db.scalar(select(func.count()).select_from(Return).where(*where))
        q = select(Return.id, Return.return_number, Return.return_date, Return.refund_amount, Return.status, Return.reason,
                   func.coalesce(Return.currency_code, currency).label("currency")).where(*where).order_by(
            Return.return_date.desc(), Return.id).offset(offset).limit(limit)
    else:
        repo = DebtRepository(db)
        rows = repo.projection(tenant, "receivable", currency, branch, datetime.now(UTC).date()).subquery()
        total = await db.scalar(select(func.count()).select_from(rows).where(rows.c.party_id == customer_id))
        q = select(rows.c.id, rows.c.reference, rows.c.issue_date, rows.c.due_date, rows.c.original, rows.c.paid, rows.c.written_off,
                   rows.c.outstanding, rows.c.status, rows.c.is_overdue, rows.c.currency, rows.c.is_manual).where(
            rows.c.party_id == customer_id).order_by(rows.c.is_overdue.desc(), rows.c.due_date.asc().nulls_last(), rows.c.id
                                                     ).offset(offset).limit(limit)
    return [dict(r) for r in (await db.execute(q)).mappings()], total or 0


async def _summary(db: AsyncSession, tenant, customer_id, branch, currency, show: set[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if "orders" in show:
        where = [Order.tenant_id == tenant, Order.customer_id == customer_id, Order.status == "Completed"]
        if branch:
            where.append(Order.branch_id == branch)
        row = (await db.execute(select(
            func.count().label("orders"), func.coalesce(func.sum(func.coalesce(Order.base_total, Order.total)), 0).label("sales"),
            func.min(Order.ordered_at).label("first"), func.max(Order.ordered_at).label("last")).where(*where))).one()
        out.update(completed_orders=row.orders, lifetime_sales=row.sales, first_order_at=row.first, last_order_at=row.last)
    if "returns" in show:
        row = (await db.execute(select(func.count(), func.coalesce(func.sum(func.coalesce(Return.base_refund_amount, Return.refund_amount)), 0))
                                .where(Return.tenant_id == tenant, Return.customer_id == customer_id))).one()
        out.update(returns=row[0], refunded=row[1])
    if "debts" in show:
        repo = DebtRepository(db)
        rows = repo.projection(tenant, "receivable", currency, branch, datetime.now(UTC).date()).subquery()
        mine = rows.c.party_id == customer_id
        row = (await db.execute(select(
            func.coalesce(func.sum(rows.c.base_outstanding), 0), func.coalesce(func.sum(case((rows.c.is_overdue, rows.c.base_outstanding), else_=0)), 0)
        ).where(mine))).one()
        out.update(outstanding=row[0], overdue=row[1])
    return out


async def profile(db: AsyncSession, user: User, active: uuid.UUID | None, customer_id: uuid.UUID) -> dict:
    if user.tenant_id is None:
        raise ValidationError("This account has no tenant")
    tenant = user.tenant_id
    branch = await resolve_branch(db, user, None, active)
    currency = await get_base_currency(db, tenant)
    customer = await _customer(db, tenant, customer_id)
    show = {s for s in SECTIONS if can(user, NEEDS[s])}
    contact = None
    if can(user, "contacts:read"):
        contact = {"id": customer.id, "name": customer.name, "email": customer.email, "phone": customer.phone, "address": customer.address,
                   "customer_type": customer.customer_type, "is_active": customer.is_active, "credit_daily_limit": customer.credit_daily_limit,
                   "created_at": customer.created_at}
    sections: dict[str, Any] = {}
    for name in SECTIONS:
        if name in show:
            items, total = await _rows(db, name, tenant, customer_id, branch, currency, 0, PREVIEW)
            sections[name] = {"items": items, "total": total}
        else:
            sections[name] = None
    deals = await db.scalar(select(func.count()).select_from(Deal).where(Deal.tenant_id == tenant, Deal.customer_id == customer_id)) \
        if can(user, "opportunities:read") else None
    return encoded({"customer": contact, "name": customer.name, "currency": currency, "branch_id": branch,
                    "summary": await _summary(db, tenant, customer_id, branch, currency, show), "deals": deals, "sections": sections})


async def section(db: AsyncSession, user: User, active: uuid.UUID | None, customer_id: uuid.UUID, name: str, page: int, size: int) -> dict:
    if name not in SECTIONS:
        raise ValidationError("Unknown section")
    if user.tenant_id is None:
        raise ValidationError("This account has no tenant")
    if not can(user, NEEDS[name]):
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError(f"Permission required: {NEEDS[name]}")
    branch = await resolve_branch(db, user, None, active)
    currency = await get_base_currency(db, user.tenant_id)
    await _customer(db, user.tenant_id, customer_id)
    items, total = await _rows(db, name, user.tenant_id, customer_id, branch, currency, (page - 1) * size, size)
    return encoded({"items": items, "total": total, "page": page, "page_size": size, "currency": currency})
