"""Closing a period and recording the opening position.

This is not a reset of data. The books and the stock ledger are cumulative, so the opening position of the next period is already what the
ledger says at the closing date. What this operation does is make that position official: it checks nothing is half-finished, shows the
balances, and then locks the books through the closing date (the same period lock a business's own accountant uses), keeping a snapshot of
the opening position with the operation. No journal, payment or stock movement is edited, deleted or re-posted.
"""
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.service.statements import trial_balance
from app.modules.admin.data_management.explorer import tz_of
from app.modules.approvals.models import ApprovalRequest
from app.modules.inventory.models.transfer import StockTransfer
from app.modules.inventory.models.warehouse import StockCount
from app.modules.inventory.service.valuation import inventory_valuation
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant

KIND = {"assets": "asset", "asset": "asset", "liabilities": "liability", "liability": "liability", "equity": "equity", "revenue": "revenue", "income": "revenue",
        "expense": "expense", "expenses": "expense"}


def _f(value) -> float:
    return float(value or 0)


async def blockers(db: AsyncSession, tenant: Tenant, closing: date, locked: date | None) -> list[dict]:
    """Everything that must be settled before the books can be closed. Each names what it is, how many, and where it is fixed."""
    t = tenant.id
    today = datetime.now(tz_of(tenant)).date()
    found: list[dict] = []

    def add(count, what, where):
        if count:
            found.append({"count": int(count), "what": what, "fix": where})

    if closing > today:
        found.append({"count": 1, "what": "The closing date is in the future", "fix": "Choose today or an earlier day"})
    if locked and closing <= locked:
        found.append({"count": 1, "what": f"The books are already closed through {locked}", "fix": "Choose a later closing date"})
    add((await db.execute(select(func.count()).select_from(Transaction).where(Transaction.tenant_id == t, Transaction.status == "Draft", Transaction.transaction_date <= closing))).scalar_one(),
        "Journals still in draft on or before the closing date", "Post or discard them in the business's Ledger")
    add((await db.execute(select(func.count()).select_from(Order).where(Order.tenant_id == t, Order.status == "Awaiting Approval", Order.ordered_at < datetime.combine(closing, datetime.max.time(), tz_of(tenant))))).scalar_one(),
        "Sales waiting for approval", "Approve or reject them in Sales")
    add((await db.execute(select(func.count()).select_from(Expense).where(Expense.tenant_id == t, Expense.status == "Pending", Expense.expense_date <= closing))).scalar_one(),
        "Expenses waiting for approval", "Approve or reject them in Expenses")
    add((await db.execute(select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.tenant_id == t, PurchaseOrder.status == "PendingApproval"))).scalar_one(),
        "Purchases waiting for approval", "Approve or reject them in Purchases")
    add((await db.execute(select(func.count()).select_from(ApprovalRequest).where(ApprovalRequest.tenant_id == t, ApprovalRequest.status == "pending"))).scalar_one(),
        "Requests waiting in Approvals", "Decide them in Approvals")
    add((await db.execute(select(func.count()).select_from(StockTransfer).where(StockTransfer.tenant_id == t, StockTransfer.status == "in_transit"))).scalar_one(),
        "Stock transfers still on the way", "Receive or cancel them in Inventory → Transfers")
    add((await db.execute(select(func.count()).select_from(StockCount).where(StockCount.tenant_id == t, StockCount.status == "Submitted"))).scalar_one(),
        "Stock counts waiting for a decision", "Approve or reject them in Inventory → Stock counts")
    return found


async def preview(db: AsyncSession, tenant: Tenant, closing: date) -> dict:
    from app.modules.admin.data_management.operations import locked_through
    locked = await locked_through(db, tenant.id)
    tb = await trial_balance(db, tenant.id, None, closing)
    groups: dict[str, list[dict]] = {"asset": [], "liability": [], "equity": []}
    revenue = expense = 0.0
    for line in tb.accounts:
        kind = KIND.get((line.type or "").lower(), "")
        balance = _f(line.balance)
        if kind in groups and balance != 0:
            groups[kind].append({"code": line.code, "name": line.name, "balance": balance})
        elif kind == "revenue":
            revenue += balance
        elif kind == "expense":
            expense += balance
    valuation = await inventory_valuation(db, tenant.id)
    outstanding = (await db.execute(select(func.coalesce(func.sum(Order.total - Order.amount_paid), 0)).where(Order.tenant_id == tenant.id, Order.status == "Completed", Order.total > Order.amount_paid))).scalar_one()
    return {
        "closing_date": closing.isoformat(), "locked_through": locked.isoformat() if locked else None, "currency": tenant.currency,
        "books_balanced": bool(tb.balanced), "balances": groups, "period_result": round(revenue - expense, 2),
        "customer_receivables": _f(outstanding), "inventory_value": _f(valuation.summary.cost_value),
        "inventory_note": "Inventory quantities and value are shown as they are now; the stock ledger is never reset.",
        "blockers": await blockers(db, tenant, closing, locked),
    }


async def execute_close(db: AsyncSession, tenant: Tenant, admin, closing: date, reason: str, label: str) -> dict:
    from app.modules.accounting.service.catalog import apply_period_lock
    from app.modules.admin.data_management.operations import locked_through
    fresh = await blockers(db, tenant, closing, await locked_through(db, tenant.id))
    if fresh:
        raise ValidationError("The books cannot be closed yet: " + "; ".join(f"{b['count']} × {b['what'].lower()}" for b in fresh))
    snapshot = await preview(db, tenant, closing)
    await apply_period_lock(db, tenant.id, admin, closing, reason, actor_label=label)
    return {"locked_through": closing.isoformat(), "opening_position": {k: snapshot[k] for k in ("balances", "period_result", "customer_receivables", "inventory_value", "currency")}}
