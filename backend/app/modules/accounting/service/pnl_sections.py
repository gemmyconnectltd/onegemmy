"""Which profit-and-loss section an account belongs to: the ONE rule the P&L, its exports, the Overview dashboard, Business
Reports, the Daily report and AI insights all use.

An account's own classification (`Account.pnl_section`, set in the Chart of Accounts) decides. Only an account nobody has
classified falls back to its code range: Revenue 49xx is other income and the rest of Revenue is sales; Expense 50xx is
cost of goods sold, 59xx is other expense and the rest of Expense is operating. Classifying an account changes how it is
reported, never a journal.

P&L order: Sales − Cost of goods sold = Gross profit − Operating expenses = Operating profit + Other income − Other expenses
= Net profit.
"""
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError

SALES, OTHER_INCOME = "sales", "other_income"
COGS, OPERATING, OTHER_EXPENSE = "cogs", "operating", "other_expense"
SECTIONS_BY_TYPE = {"Revenue": (SALES, OTHER_INCOME), "Expense": (COGS, OPERATING, OTHER_EXPENSE)}
LABELS = {SALES: "Sales income", OTHER_INCOME: "Other income", COGS: "Cost of goods sold", OPERATING: "Operating expense",
          OTHER_EXPENSE: "Other expense"}

# Fallback for accounts with no classification (the long-standing code ranges).
COGS_PREFIX = "50"
OTHER_EXPENSE_PREFIX = "59"
OTHER_INCOME_PREFIX = "49"


def section(type_: str, code: str, pnl_section: str | None) -> str | None:
    """The P&L section of an account (None for balance-sheet accounts)."""
    allowed = SECTIONS_BY_TYPE.get(type_)
    if not allowed:
        return None
    if pnl_section in allowed:
        return pnl_section
    code = code or ""
    if type_ == "Revenue":
        return OTHER_INCOME if code.startswith(OTHER_INCOME_PREFIX) else SALES
    if code.startswith(COGS_PREFIX):
        return COGS
    return OTHER_EXPENSE if code.startswith(OTHER_EXPENSE_PREFIX) else OPERATING


def of(account) -> str | None:
    return section(account.type, account.code, getattr(account, "pnl_section", None))


def section_sql(account_model):
    """The same rule as `section`, as an SQL expression over the accounts table."""
    a = account_model
    return case(
        (and_(a.type == "Revenue", a.pnl_section.in_((SALES, OTHER_INCOME))), a.pnl_section),
        (and_(a.type == "Expense", a.pnl_section.in_((COGS, OPERATING, OTHER_EXPENSE))), a.pnl_section),
        (and_(a.type == "Revenue", a.code.like(f"{OTHER_INCOME_PREFIX}%")), OTHER_INCOME),
        (a.type == "Revenue", SALES),
        (and_(a.type == "Expense", a.code.like(f"{COGS_PREFIX}%")), COGS),
        (and_(a.type == "Expense", a.code.like(f"{OTHER_EXPENSE_PREFIX}%")), OTHER_EXPENSE),
        (a.type == "Expense", OPERATING),
        else_=None,
    )


def validate(type_: str, pnl_section: str | None) -> None:
    """A classification must fit the account type (only Revenue and Expense accounts have one)."""
    if pnl_section is None:
        return
    allowed = SECTIONS_BY_TYPE.get(type_)
    if not allowed:
        raise ValidationError("Only Revenue and Expense accounts have a profit-and-loss section")
    if pnl_section not in allowed:
        raise ValidationError(f"A {type_} account is one of: {', '.join(LABELS[s] for s in allowed)}")


async def other_income(db: AsyncSession, tenant_id: uuid.UUID, branches: list[uuid.UUID] | None, start: date, end: date) -> dict:
    """Posted other income (net credits on other-income accounts, by transaction date), in total, per branch and per day and
    branch. `branches` None means the whole business; a list limits it to those branches (entries with no branch are then left
    out, like sales with no branch). Amounts are net of VAT, as posted."""
    from app.modules.accounting.models.account import Account
    from app.modules.accounting.models.transaction import Transaction
    from app.modules.accounting.models.transaction_line import TransactionLine

    amount = func.sum(case((TransactionLine.type == "credit", TransactionLine.amount), else_=-TransactionLine.amount))
    stmt = (select(Transaction.transaction_date, Transaction.branch_id, amount)
            .select_from(Transaction)
            .join(TransactionLine, TransactionLine.transaction_id == Transaction.id)
            .join(Account, and_(Account.id == TransactionLine.account_id, Account.tenant_id == tenant_id))
            .where(Transaction.tenant_id == tenant_id, Transaction.status == "Posted", Transaction.transaction_date >= start,
                   Transaction.transaction_date <= end, section_sql(Account) == OTHER_INCOME)
            .group_by(Transaction.transaction_date, Transaction.branch_id))
    if branches is not None:
        stmt = stmt.where(Transaction.branch_id.in_(branches or [None]))
    by_branch: dict[uuid.UUID | None, Decimal] = {}
    by_day: dict[tuple[date, uuid.UUID | None], Decimal] = {}
    total = Decimal(0)
    for day, branch_id, value in (await db.execute(stmt)).all():
        value = Decimal(value or 0)
        total += value
        by_branch[branch_id] = by_branch.get(branch_id, Decimal(0)) + value
        by_day[(day, branch_id)] = by_day.get((day, branch_id), Decimal(0)) + value
    return {"total": total, "by_branch": by_branch, "by_day": by_day}
