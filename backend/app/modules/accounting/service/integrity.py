"""Read-only reconciliation of operational records against the ledger. It reports; it never repairs.
Each finding names the record, what the ledger shows, what it should show and the risk, so a correction
can be reviewed and approved separately."""
import uuid
from decimal import Decimal

from sqlalchemy import and_, case, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.models.account import Account
from app.modules.accounting.models.debt import DebtAdjustment
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.service.workspace import allow
from app.modules.sales.models.order import Order
from app.modules.sales.models.return_ import Return
from app.modules.tenants.models.user import User

LIMIT = 200


def _finding(kind: str, reference: str, on, impact: str, expected: str, action: str, risk: str) -> dict:
    return {"type": kind, "reference": reference, "date": str(on) if on else None, "current_impact": impact,
            "expected_treatment": expected, "recommended_correction": action, "risk": risk}


async def reconcile(db: AsyncSession, user: User) -> dict:
    tenant = allow(user, "journal_entries", "read")
    live = Transaction.status != "Void"
    findings: list[dict] = []

    sales = (await db.execute(
        select(Order.order_number, Order.ordered_at, Order.total).where(
            Order.tenant_id == tenant, Order.status == "Completed",
            ~exists().where(and_(Transaction.order_id == Order.id, Transaction.type == "sale", live))).limit(LIMIT))).all()
    findings += [_finding("sale_without_journal", n, d, f"Sale of {t} is missing from revenue, receivables and VAT",
                          "Dr cash/receivable, Cr sales revenue and VAT", "Post the sale journal through an approved correction", "high") for n, d, t in sales]

    misdated = (await db.execute(
        select(Order.order_number, Order.ordered_at, Transaction.transaction_date, Transaction.reference).join(
            Transaction, and_(Transaction.order_id == Order.id, Transaction.type == "sale", live)).where(
            Order.tenant_id == tenant, Order.ordered_at.is_not(None), func.date(Order.ordered_at) != Transaction.transaction_date).limit(LIMIT))).all()
    findings += [_finding("sale_posted_on_wrong_date", n, d, f"Journal {ref} is dated {posted}, the sale {d:%Y-%m-%d}",
                          "Journal dated on the sale date", "Reverse and repost in an open period, or accept as a known historical difference", "medium")
                 for n, d, posted, ref in misdated]

    expenses = (await db.execute(
        select(Expense.reference, Expense.expense_date, Expense.amount).where(
            Expense.tenant_id == tenant, Expense.status == "Approved",
            ~exists().where(and_(Transaction.tenant_id == tenant, Transaction.type == "expense",
                                 Transaction.description == func.concat("Expense ", Expense.reference), live))).limit(LIMIT))).all()
    findings += [_finding("approved_expense_without_journal", r, d, f"Expense of {a} is missing from the income statement",
                          "Dr expense account, Cr cash/bank", "Post the expense journal through an approved correction", "high") for r, d, a in expenses]

    returns = (await db.execute(
        select(Return.return_number, Return.return_date, Return.refund_amount).where(
            Return.tenant_id == tenant, Return.status == "Approved",
            ~exists().where(and_(Transaction.return_id == Return.id, live))).limit(LIMIT))).all()
    findings += [_finding("return_without_journal", n, d, f"Refund of {a} not reflected in revenue or receivables",
                          "Reverse revenue, VAT and cost of sales", "Post the return journal through an approved correction", "high") for n, d, a in returns]

    old_returns = (await db.execute(
        select(Return.return_number, Return.return_date, Return.refund_amount).join(
            Transaction, and_(Transaction.return_id == Return.id, Transaction.type == "return", live)).where(
            Return.tenant_id == tenant,
            ~exists().where(and_(TransactionLine.transaction_id == Transaction.id, TransactionLine.description == "VAT Reversal"))).limit(LIMIT))).all()
    findings += [_finding("return_with_incomplete_accounting", n, d, f"Only revenue and receivables were reversed for {a}; VAT and cost of sales were not",
                          "Also reverse VAT payable and cost of goods sold / inventory", "Post a supplementary adjustment journal after review", "medium") for n, d, a in old_returns]

    writeoffs = (await db.execute(
        select(DebtAdjustment.id, DebtAdjustment.kind, DebtAdjustment.created_at, DebtAdjustment.amount).where(
            DebtAdjustment.tenant_id == tenant, DebtAdjustment.action == "write_off",
            ~exists().where(and_(Transaction.tenant_id == tenant, Transaction.client_reference == func.concat("writeoff:", DebtAdjustment.id)))).limit(LIMIT))).all()
    findings += [_finding("write_off_without_journal", str(i)[:8], d, f"{k} balance reduced by {a} but the ledger is unchanged",
                          "Dr bad debt expense / Cr accounts receivable (or Dr payable / Cr other income)", "Post the write-off journal through an approved correction", "high")
                 for i, k, d, a in writeoffs]

    ar_ledger = await db.scalar(
        select(func.coalesce(func.sum(case((TransactionLine.type == "debit", TransactionLine.amount), else_=-TransactionLine.amount)), 0))
        .select_from(TransactionLine).join(Transaction, Transaction.id == TransactionLine.transaction_id)
        .join(Account, Account.id == TransactionLine.account_id)
        .where(Transaction.tenant_id == tenant, Transaction.status == "Posted", Account.code == "1100"))
    summary = {"accounts_receivable_in_ledger": str(Decimal(ar_ledger or 0).quantize(Decimal("0.01"))),
               "findings": len(findings), "high_risk": sum(1 for f in findings if f["risk"] == "high"), "limit_per_type": LIMIT}
    return {"summary": summary, "findings": findings, "tenant_id": str(tenant) if isinstance(tenant, uuid.UUID) else tenant}
