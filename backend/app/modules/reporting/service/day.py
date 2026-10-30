"""One branch's day on one page: sales per item, debt, deposits, stock movement and expenses.

It uses the same definitions as the daily branch activity report (completed orders in the business's base currency, counted on the day
they were ordered, in the business's timezone). Stock is one quantity for the whole business in PESAA, so a branch's day shows what moved
(received, sold, adjusted, transferred) and never an invented opening or closing balance for the branch.
"""
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.service.workspace import allow
from app.modules.approvals.models import ApprovalRequest
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.transfer import StockTransfer
from app.modules.procurement.models.purchase_item import PurchaseItem
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.reporting.repository.daily import DailyRepository
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.order_payment import OrderPayment
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.repository import BranchRepository

_RATE = func.coalesce(Order.exchange_rate, 1)
_SALES = func.coalesce(Order.base_total, Order.total * _RATE)


async def day_report(db: AsyncSession, user: User, day: date | None, branch_id: uuid.UUID | None) -> dict:
    tenant_id = allow(user, "journal_entries")
    for resource in ("stock", "accounts_receivable", "expenses"):
        allow(user, resource)
    tenant = await db.get(Tenant, tenant_id)
    tz = ZoneInfo(tenant.timezone or "UTC")
    day = day or datetime.now(tz).date()
    if day > datetime.now(tz).date() + timedelta(days=1):
        raise ValidationError("Choose today or an earlier day")
    begin, finish = datetime.combine(day, time.min, tz), datetime.combine(day + timedelta(days=1), time.min, tz)
    allowed = ([uuid.UUID(str(i)) for i in user.branch_ids] if user.branch_ids is not None else [user.branch_id] if user.branch_id else None)
    if branch_id:
        if allowed is not None and branch_id not in allowed:
            raise ForbiddenError("This branch is not assigned to your account")
        if await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id) is None:
            raise ValidationError("Choose a branch belonging to this business")
        allowed = [branch_id]
    if allowed is not None and not allowed:
        raise ForbiddenError("No branches assigned. Ask an owner to assign a branch.")

    def scope(column):
        return [column.in_(allowed)] if allowed is not None else []

    done = (Order.tenant_id == tenant_id, Order.status == "Completed", Order.ordered_at >= begin, Order.ordered_at < finish, *scope(Order.branch_id))
    pay_rate = func.coalesce(OrderPayment.exchange_rate, 1)
    amount = func.coalesce(OrderPayment.base_amount, OrderPayment.amount * pay_rate)

    items = (await db.execute(
        select(OrderItem.product_name, OrderItem.sku, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total * _RATE), func.count(func.distinct(OrderItem.order_id)))
        .join(Order, Order.id == OrderItem.order_id).where(*done).group_by(OrderItem.product_name, OrderItem.sku).order_by(func.sum(OrderItem.line_total * _RATE).desc())
    )).all()
    sales, orders = (await db.execute(select(func.coalesce(func.sum(_SALES), 0), func.count()).where(*done))).one()

    credit = (await db.execute(
        select(Order.order_number, Customer.name, func.coalesce(Order.credit_base, 0)).outerjoin(Customer, Customer.id == Order.customer_id)
        .where(Order.tenant_id == tenant_id, Order.status == "Completed", Order.credit_base.is_not(None), Order.credit_base > 0,
               func.coalesce(Order.credit_granted_at, Order.ordered_at) >= begin, func.coalesce(Order.credit_granted_at, Order.ordered_at) < finish, *scope(Order.branch_id))
        .order_by(Order.ordered_at.desc())
    )).all()
    owed = await DailyRepository(db).outstanding_debt(tenant_id, allowed)

    deposits = (await db.execute(
        select(func.coalesce(OrderPayment.payment_method, "other"), func.coalesce(func.sum(amount), 0), func.count())
        .where(OrderPayment.tenant_id == tenant_id, OrderPayment.status == "Completed", OrderPayment.paid_at >= begin, OrderPayment.paid_at < finish, *scope(OrderPayment.branch_id))
        .group_by(func.coalesce(OrderPayment.payment_method, "other"))
    )).all()

    received = (await db.execute(
        select(PurchaseItem.product_name, func.sum(PurchaseItem.quantity)).join(PurchaseOrder, PurchaseOrder.id == PurchaseItem.purchase_order_id)
        .where(PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.status == "Received", PurchaseOrder.received_at >= begin, PurchaseOrder.received_at < finish, *scope(PurchaseOrder.branch_id))
        .group_by(PurchaseItem.product_name)
    )).all()
    adjustments = (await db.execute(
        select(ApprovalRequest.title, ApprovalRequest.payload).where(ApprovalRequest.tenant_id == tenant_id, ApprovalRequest.kind == "stock_adjustment", ApprovalRequest.status == "approved",
                                                                    ApprovalRequest.applied_at >= begin, ApprovalRequest.applied_at < finish, *scope(ApprovalRequest.branch_id))
    )).all()
    transfers = (await db.execute(
        select(StockTransfer.transfer_number, StockTransfer.status, StockTransfer.from_branch_id, StockTransfer.to_branch_id)
        .where(StockTransfer.tenant_id == tenant_id, StockTransfer.created_at >= begin, StockTransfer.created_at < finish,
               *([(StockTransfer.from_branch_id.in_(allowed)) | (StockTransfer.to_branch_id.in_(allowed))] if allowed is not None else []))
    )).all()
    expenses = (await db.execute(
        select(Expense.reference, Expense.title, Expense.category, func.coalesce(Expense.base_amount, Expense.amount), Expense.status)
        .where(Expense.tenant_id == tenant_id, Expense.expense_date == day, *scope(Expense.branch_id)).order_by(Expense.created_at.desc())
    )).all()
    sold = {n: (q, a) for n, _, q, a, _ in items}
    movement = sorted({*(n for n, _ in received), *sold, *(t.replace("Stock of ", "") for t, _ in adjustments)})
    on_hand = dict((await db.execute(select(Product.name, Product.stock).where(Product.tenant_id == tenant_id, Product.name.in_(movement)))).all()) if movement else {}
    rec = dict(received)
    adj = {t.replace("Stock of ", ""): p.get("difference", 0) for t, p in adjustments}
    approved = [e for e in expenses if e[4] == "Approved"]
    return {
        "day": day.isoformat(), "currency": tenant.currency, "timezone": tenant.timezone, "branch_id": str(branch_id) if branch_id else None,
        "sales": {"total": sales, "orders": orders, "items": [{"name": n, "sku": s, "quantity": q, "amount": a, "orders": o} for n, s, q, a, o in items]},
        "debt": {"new_credit": sum((Decimal(c) for _, _, c in credit), Decimal(0)), "sales": [{"number": n, "customer": c or "Walk-in", "amount": a} for n, c, a in credit], "outstanding_now": owed,
                 "note": "Outstanding is customer debt right now, not as at the end of the day."},
        "deposits": {"total": sum((Decimal(a) for _, a, _ in deposits), Decimal(0)), "methods": [{"method": m, "amount": a, "payments": n} for m, a, n in deposits]},
        "stock": {"items": [{"name": n, "received": rec.get(n, 0), "sold": sold.get(n, (0, 0))[0], "adjusted": adj.get(n, 0), "on_hand_now": on_hand.get(n)} for n in movement],
                  "transfers": [{"number": n, "status": s} for n, s, _, _ in transfers],
                  "note": "Stock is counted for the whole business, so a branch's day shows what moved, not an opening or closing balance."},
        "expenses": {"approved_total": sum((Decimal(e[3]) for e in approved), Decimal(0)), "pending": sum(1 for e in expenses if e[4] == "Pending"),
                     "items": [{"reference": r, "title": t, "category": c, "amount": a, "status": s} for r, t, c, a, s in expenses]},
    }
