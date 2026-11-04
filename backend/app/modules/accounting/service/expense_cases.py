"""The situations around an expense beyond "record, approve": a wrong category (reclassify), paying later, a supplier refund,
an approval limit, a possible duplicate and recurring expenses. Posted entries are never edited: each case adds its own entry."""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.budget import Budget
from app.modules.accounting.models.expense import Expense, RecurringExpense
from app.modules.accounting.repository import BudgetRepository
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.schemas.expense import ExpenseCreate
from app.modules.audit.service import record_audit
from app.modules.tenants.models import Tenant, User

METHOD_ACCOUNTS = {"cash": ("1000", "Cash"), "bank transfer": ("1010", "Bank"), "bank": ("1010", "Bank"), "card": ("1010", "Bank"),
                   "mobile money": ("1020", "Mobile Money"), "mobile": ("1020", "Mobile Money")}


async def _locked_expense(db: AsyncSession, tenant_id: uuid.UUID, expense_id: uuid.UUID) -> Expense:
    await db.execute(text("SELECT 1 FROM accounting_expenses WHERE id = :id FOR UPDATE"), {"id": expense_id})
    obj = await db.get(Expense, expense_id)
    if obj is None or obj.tenant_id != tenant_id:
        raise NotFoundError("Expense not found")
    return obj


async def _expense_account(db: AsyncSession, tenant_id: uuid.UUID, obj: Expense) -> Account:
    account = await db.get(Account, obj.account_id) if obj.account_id else None
    if account is None or account.tenant_id != tenant_id:
        raise ValidationError("This expense has no expense account to adjust")
    return account


async def _move_budget(db: AsyncSession, tenant_id: uuid.UUID, obj: Expense, account_id: uuid.UUID | None, amount: Decimal) -> None:
    """Adds `amount` (negative to release) to the budget of the expense's month for that account, if there is one."""
    if account_id is None:
        return
    budget = await BudgetRepository(db).get_by_account_period(tenant_id, account_id, obj.expense_date.strftime("%Y-%m"))
    if budget:
        await db.execute(update(Budget).where(Budget.id == budget.id).values(spent=Budget.spent + amount))


async def reclassify(db: AsyncSession, user: User, expense_id: uuid.UUID, new_account_id: uuid.UUID, reason: str) -> Expense:
    """Wrong category or account: move the amount from the old expense account to the right one with an adjusting entry.
    The original posting stays; the report shows the amount under the new account from the entry's date."""
    from app.modules.accounting.service.transaction import post_journal
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValidationError("A reason is required to reclassify an expense")
    await ReportingRepository(db).lock_tenant(user.tenant_id)
    obj = await _locked_expense(db, user.tenant_id, expense_id)
    if obj.status != "Approved":
        raise ValidationError("Only an approved expense is reclassified; edit a pending one directly")
    old = await _expense_account(db, user.tenant_id, obj)
    new = await db.get(Account, new_account_id)
    if new is None or new.tenant_id != user.tenant_id or not new.is_active or new.type not in {"Expense", "Expenses"}:
        raise ValidationError("Choose an active expense account")
    if new.id == old.id:
        raise ValidationError("That is already the expense account")
    remaining = Decimal(str(obj.base_amount if obj.base_amount is not None else obj.amount)) - Decimal(str(obj.refunded_amount or 0))
    txn = await post_journal(
        db, user.tenant_id, user.id, type="adjustment", description=f"Reclassify {obj.reference}: {old.name} to {new.name} ({reason})"[:500],
        branch_id=obj.branch_id, client_reference=f"rc:{obj.id}:{uuid.uuid4().hex[:8]}",
        lines=[(new.code, new.name, "debit", remaining, "Reclassified in"), (old.code, old.name, "credit", remaining, "Reclassified out")])
    await _move_budget(db, user.tenant_id, obj, old.id, -remaining)
    await _move_budget(db, user.tenant_id, obj, new.id, remaining)
    obj.account_id = new.id
    await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="expense.reclassify", entity_type="expense",
                       entity_id=str(obj.id), summary=f"Reclassified {obj.reference} from {old.name} to {new.name}: {reason}",
                       changes={"before": {"account": old.name}, "after": {"account": new.name}, "reason": reason, "journal": txn.reference, "amount": str(remaining)})
    await db.commit()
    await db.refresh(obj)
    return obj


async def pay(db: AsyncSession, user: User, expense_id: uuid.UUID, payment_method: str, paid_on: date | None) -> Expense:
    """An expense booked to Accounts Payable is paid: Dr Accounts Payable / Cr the cash, bank or mobile-money account."""
    from app.modules.accounting.service.transaction import post_journal
    await ReportingRepository(db).lock_tenant(user.tenant_id)
    obj = await _locked_expense(db, user.tenant_id, expense_id)
    if not obj.on_credit or obj.status != "Approved":
        raise ValidationError("Only an approved expense booked as unpaid can be marked paid")
    if obj.paid_at is not None:
        raise ConflictError("This expense is already paid")
    code, label = METHOD_ACCOUNTS.get(payment_method.strip().lower(), ("1000", "Cash"))
    amount = Decimal(str(obj.base_amount if obj.base_amount is not None else obj.amount))
    txn = await post_journal(
        db, user.tenant_id, user.id, type="payment", description=f"Payment of {obj.reference} ({label})", posting_date=paid_on, branch_id=obj.branch_id,
        client_reference=f"exppay:{obj.id}", lines=[("2000", "Accounts Payable", "debit", amount, "Accounts Payable"), (code, label, "credit", amount, f"Paid from {label}")])
    obj.paid_at = datetime.now(UTC)
    await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="expense.pay", entity_type="expense", entity_id=str(obj.id),
                       summary=f"Paid expense {obj.reference} from {label}", changes={"amount": str(amount), "journal": txn.reference, "method": payment_method})
    await db.commit()
    await db.refresh(obj)
    return obj


async def refund(db: AsyncSession, user: User, expense_id: uuid.UUID, amount: Decimal, method: str, reason: str, on: date | None) -> Expense:
    """The supplier gave money back (a refund or credit note): Dr cash/bank / Cr the expense account, for up to what was spent."""
    from app.modules.accounting.service.transaction import post_journal
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValidationError("A reason is required to record a refund")
    await ReportingRepository(db).lock_tenant(user.tenant_id)
    obj = await _locked_expense(db, user.tenant_id, expense_id)
    if obj.status != "Approved":
        raise ValidationError("Only an approved expense can have a refund recorded")
    spent = Decimal(str(obj.base_amount if obj.base_amount is not None else obj.amount))
    already = Decimal(str(obj.refunded_amount or 0))
    if amount <= 0 or amount > spent - already:
        raise ValidationError(f"A refund must be between 0 and {spent - already} (what is left of {spent})")
    account = await _expense_account(db, user.tenant_id, obj)
    code, label = METHOD_ACCOUNTS.get(method.strip().lower(), ("1000", "Cash"))
    txn = await post_journal(
        db, user.tenant_id, user.id, type="refund", description=f"Refund on {obj.reference}: {reason}"[:500], posting_date=on, branch_id=obj.branch_id,
        client_reference=f"xr:{obj.id}:{uuid.uuid4().hex[:8]}", lines=[(code, label, "debit", amount, f"Refund received in {label}"), (account.code, account.name, "credit", amount, "Expense refunded")])
    obj.refunded_amount = already + amount
    await _move_budget(db, user.tenant_id, obj, account.id, -amount)
    await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="expense.refund", entity_type="expense", entity_id=str(obj.id),
                       summary=f"Refund of {amount} recorded on {obj.reference}: {reason}", changes={"amount": str(amount), "method": method, "journal": txn.reference, "reason": reason})
    await db.commit()
    await db.refresh(obj)
    return obj


# ── approval limit and duplicates ────────────────────────────────────────────

async def auto_approve_limit(db: AsyncSession, tenant_id: uuid.UUID) -> Decimal | None:
    rules = (await db.execute(select(Tenant.approval_rules).where(Tenant.id == tenant_id))).scalar_one_or_none() or {}
    value = rules.get("expense_auto_approve_below")
    return Decimal(str(value)) if value not in (None, "", 0, "0") else None


async def set_auto_approve_limit(db: AsyncSession, user: User, value: Decimal | None) -> dict:
    tenant = await db.get(Tenant, user.tenant_id)
    rules = dict(tenant.approval_rules or {})
    if value is None or value <= 0:
        rules.pop("expense_auto_approve_below", None)
    else:
        rules["expense_auto_approve_below"] = str(value)
    tenant.approval_rules = rules
    await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="expense.approval_limit", entity_type="tenant",
                       entity_id=str(user.tenant_id), summary=f"Expenses up to {value} are approved automatically" if value and value > 0 else "Automatic approval of small expenses turned off")
    await db.commit()
    return {"auto_approve_below": str(value) if value and value > 0 else None}


async def find_duplicate(db: AsyncSession, tenant_id: uuid.UUID, data: ExpenseCreate) -> Expense | None:
    """A live expense with the same amount and date that also shares the supplier, the reference number or the title."""
    same = [Expense.tenant_id == tenant_id, Expense.status.in_(("Pending", "Approved")), Expense.amount == data.amount, Expense.expense_date == data.expense_date]
    match = [func.lower(Expense.title) == data.title.strip().lower()]
    if data.supplier_id:
        match.append(Expense.supplier_id == data.supplier_id)
    if data.reference_number:
        match.append(Expense.reference_number == data.reference_number)
    return (await db.execute(select(Expense).where(and_(*same), or_(*match)).limit(1))).scalars().first()


# ── recurring expenses ───────────────────────────────────────────────────────

def _advance(day: date, frequency: str) -> date:
    if frequency == "weekly":
        return day + timedelta(days=7)
    import calendar
    year, month = (day.year + day.month // 12, day.month % 12 + 1)
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


async def create_recurring(db: AsyncSession, user: User, data: dict) -> RecurringExpense:
    if data["frequency"] not in {"weekly", "monthly"}:
        raise ValidationError("Choose weekly or monthly")
    row = RecurringExpense(tenant_id=user.tenant_id, created_by=user.id, **data)
    db.add(row)
    await db.flush()
    await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="expense.recurring_create", entity_type="expense",
                       entity_id=str(row.id), summary=f"Recurring expense {row.title} ({row.frequency}) from {row.next_date}")
    await db.commit()
    return row


async def list_recurring(db: AsyncSession, tenant_id: uuid.UUID) -> list[RecurringExpense]:
    return list((await db.execute(select(RecurringExpense).where(RecurringExpense.tenant_id == tenant_id).order_by(RecurringExpense.next_date))).scalars().all())


async def toggle_recurring(db: AsyncSession, user: User, recurring_id: uuid.UUID) -> RecurringExpense:
    row = await db.get(RecurringExpense, recurring_id)
    if row is None or row.tenant_id != user.tenant_id:
        raise NotFoundError("Recurring expense not found")
    row.is_active = not row.is_active
    await db.commit()
    return row


async def run_due(db: AsyncSession, user: User, today: date | None = None) -> dict:
    """Creates the pending expenses that have come due (one per missed period, at most 12 each), then moves the next date on.
    Safe to run again: each period carries its own reference, so nothing is created twice."""
    from app.modules.accounting.service import expense as lifecycle
    today = today or datetime.now(UTC).date()
    created = 0
    for row in await list_recurring(db, user.tenant_id):
        guard = 0
        while row.is_active and row.next_date <= today and guard < 12:
            payload = ExpenseCreate(title=row.title, amount=row.amount, expense_date=row.next_date, category=row.category, supplier_id=row.supplier_id,
                                    payment_method=row.payment_method, account_id=row.account_id, branch_id=row.branch_id, on_credit=row.on_credit,
                                    client_reference=f"rec{str(row.id)[:8]}{row.next_date:%Y%m%d}", notes=f"Recurring ({row.frequency})")
            prior = (await db.execute(select(Expense.id).where(Expense.tenant_id == user.tenant_id, Expense.client_reference == payload.client_reference))).first()
            if prior is None:
                await lifecycle.create_expense(db, user.tenant_id, user.id, payload, user.full_name)
                created += 1
            row.next_date = _advance(row.next_date, row.frequency)
            guard += 1
    await db.commit()
    return {"created": created}
