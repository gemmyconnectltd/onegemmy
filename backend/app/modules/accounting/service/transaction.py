import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import ZERO, to_decimal
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.repository import AccountRepository, TransactionRepository
from app.modules.accounting.schemas import TransactionCreate, TransactionRead, TransactionUpdate
from app.modules.accounting.service.account import DEFAULT_ACCOUNTS
from app.modules.audit.service import record_audit


async def list_transactions(db: AsyncSession, tenant_id: uuid.UUID, type: str | None = None, status: str | None = None, offset: int = 0, limit: int = 50, branch_id: uuid.UUID | None = None) -> list[TransactionRead]:
    items = await TransactionRepository(db).list_for_tenant(tenant_id, type, status, offset, min(limit, 100), branch_id)
    return [TransactionRead.model_validate(i) for i in items]


async def count_transactions(db: AsyncSession, tenant_id: uuid.UUID, type: str | None = None, status: str | None = None, branch_id: uuid.UUID | None = None) -> int:
    return await TransactionRepository(db).count_for_tenant(tenant_id, type, status, branch_id)


async def get_transaction(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> TransactionRead:
    obj = await TransactionRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transaction not found")
    return TransactionRead.model_validate(obj)


async def create_transaction(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: TransactionCreate) -> TransactionRead:

    from app.modules.accounting.repository.reporting import ReportingRepository
    from app.modules.accounting.service.workspace import allow, resolve_branch
    from app.modules.tenants.models import User
    actor = await db.get(User, user_id)
    if actor is not None:
        if actor.tenant_id != tenant_id:
            raise ValidationError("Journal actor does not belong to this business")
        allow(actor, "journal_entries", "create")
        data.branch_id = await resolve_branch(db, actor, data.branch_id)
    if data.type not in {"manual", "adjustment"} or any((data.order_id, data.return_id, data.purchase_id)):
        raise ValidationError("Source journals are created by their sales/purchase workflows; manual journals cannot attach source documents")
    await ReportingRepository(db).lock_tenant(tenant_id)
    ids = {line.account_id for line in data.lines}
    accounts = await AccountRepository(db).get_many(tenant_id, ids=ids, active=True)
    if len(accounts) != len(ids):
        raise ValidationError("Every journal account must be active and belong to this business")
    if len(data.lines) < 2:
        raise ValidationError("A transaction must have at least 2 lines")
    total_debits = sum(l.amount for l in data.lines if l.type == "debit")
    total_credits = sum(l.amount for l in data.lines if l.type == "credit")
    if round(total_debits, 2) != round(total_credits, 2):
        raise ValidationError(f"Debits ({total_debits}) must equal credits ({total_credits})")

    repo = TransactionRepository(db)
    existing = await repo.by_client_reference(tenant_id, data.client_reference) if data.client_reference else None
    if existing is not None:
        existing_lines = sorted((str(l.account_id), l.type, Decimal(l.amount)) for l in existing.lines)
        new_lines = sorted((str(l.account_id), l.type, l.amount) for l in data.lines)
        if existing_lines != new_lines or existing.transaction_date.isoformat() != data.transaction_date or existing.description != data.description or existing.branch_id != data.branch_id:
            raise ConflictError("Journal reference was already used with different details")
        return TransactionRead.model_validate(existing)
    reference = await repo.next_reference(tenant_id)
    txn = Transaction(
        client_reference=data.client_reference,
        tenant_id=tenant_id,
        currency_code=await _ledger_currency(db, tenant_id),
        reference=reference,
        type=data.type,
        branch_id=data.branch_id,
        status="Draft",
        transaction_date=date.fromisoformat(data.transaction_date),
        description=data.description,
        order_id=data.order_id,
        return_id=data.return_id,
        purchase_id=data.purchase_id,
        created_by=user_id,
    )
    txn = await repo.save(txn)
    for line_data in data.lines:
        line = TransactionLine(
            transaction_id=txn.id,
            account_id=line_data.account_id,
            type=line_data.type,
            amount=line_data.amount,
            description=line_data.description,
        )
        db.add(line)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        action="transaction.create",
        entity_type="transaction",
        entity_id=str(txn.id),
        summary=f"Created {data.type} transaction {reference} ({len(data.lines)} lines)",
        changes={"type": data.type, "reference": reference, "lines": len(data.lines), "transaction_date": data.transaction_date},
    )
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, txn.id)
    return TransactionRead.model_validate(obj)


async def update_transaction(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: TransactionUpdate, actor=None) -> TransactionRead:
    repo = TransactionRepository(db)
    obj = await repo.locked(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transaction not found")
    if actor is not None:
        from app.core.exceptions import ForbiddenError
        from app.modules.accounting.service.workspace import allow
        allow(actor, "journal_entries", "update")
        if actor.branch_id and actor.branch_id != obj.branch_id:
            raise ForbiddenError("Journal is outside the assigned branch")
    if obj.status != "Draft":
        raise ValidationError("Posted journals are immutable; use the authorized reversal workflow")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return TransactionRead.model_validate(obj)


async def post_transaction(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None = None) -> TransactionRead:
    from app.modules.accounting.service.workspace import allow
    from app.modules.tenants.models import User
    actor = await db.get(User, user_id)
    if actor is not None:
        allow(actor, "journal_entries", "approve")
    repo = TransactionRepository(db)
    obj = await repo.locked(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transaction not found")
    if actor is not None and actor.branch_id and obj.branch_id != actor.branch_id:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("Journal is outside the assigned branch")
    if obj.status == "Posted":
        return TransactionRead.model_validate(obj)
    if obj.status != "Draft":
        raise ValidationError(f"Cannot post a transaction with status '{obj.status}'")
    if len(obj.lines) < 2 or sum((Decimal(l.amount) for l in obj.lines if l.type == "debit"), Decimal(0)) != sum((Decimal(l.amount) for l in obj.lines if l.type == "credit"), Decimal(0)):
        raise ValidationError("Journal debits and credits must reconcile before posting")
    if any(l.account is None or l.account.tenant_id != tenant_id or not l.account.is_active or Decimal(l.amount) <= 0 or l.type not in {"debit", "credit"} for l in obj.lines):
        raise ValidationError("Journal contains invalid or cross-business account lines")
    if actor is not None and actor.branch_id and obj.branch_id != actor.branch_id:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("Journal is outside the assigned branch")
    obj.status = "Posted"
    await repo.save(obj)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="transaction.post",
        entity_type="transaction",
        entity_id=str(obj.id),
        summary=f"Posted transaction {obj.reference}",
        changes={"status": "Posted", "reference": obj.reference},
    )
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return TransactionRead.model_validate(obj)


async def void_transaction(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None = None) -> TransactionRead:
    from app.modules.accounting.service.workspace import allow
    from app.modules.tenants.models import User
    actor = await db.get(User, user_id)
    if actor is not None:
        allow(actor, "journal_entries", "delete")
    repo = TransactionRepository(db)
    obj = await repo.locked(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transaction not found")
    if obj.status == "Void":
        raise ValidationError("Transaction is already void")
    if obj.type not in {"manual", "adjustment"}:
        raise ValidationError("Reverse source journals through their original payment, sales or purchasing workflow")
    if actor is not None and actor.branch_id and obj.branch_id != actor.branch_id:
        from app.core.exceptions import ForbiddenError
        raise ForbiddenError("Journal is outside the assigned branch")
    obj.status = "Void"
    await repo.save(obj)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="transaction.void",
        entity_type="transaction",
        entity_id=str(obj.id),
        summary=f"Voided transaction {obj.reference}",
        changes={"status": "Void", "reference": obj.reference},
    )
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return TransactionRead.model_validate(obj)


# ── Internal helpers called by sales service hooks ──────────────────────────

async def _ledger_currency(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    """The currency every line of a transaction is in: the tenant's base currency (the ledger is
    always kept in it; foreign documents are converted before they are posted)."""
    # Imported here: currency.service imports the sales/procurement models, which would make this
    # module's import circular if done at the top.
    from app.modules.currency.service import get_base_currency

    return await get_base_currency(db, tenant_id)


async def _add_fx_line(
    db: AsyncSession, tenant_id: uuid.UUID, txn_id: uuid.UUID, *, gain: bool, amount: Decimal, reverse: bool = False,
) -> None:
    """One realised foreign-exchange line: a gain is a credit to 4900, a loss a debit to 5950.
    ``reverse=True`` posts the opposite side (used when a payment is reversed)."""
    code = "4900" if gain else "5950"
    account_id = await _get_account_by_code(db, tenant_id, code)
    if account_id is None:
        raise ValidationError("The foreign exchange accounts are missing from the chart of accounts")
    credit = gain != reverse
    db.add(TransactionLine(
        transaction_id=txn_id, account_id=account_id, type="credit" if credit else "debit", amount=amount,
        description=("Foreign exchange gain" if gain else "Foreign exchange loss") + (" (reversed)" if reverse else ""),
    ))


async def _get_account_by_code(db: AsyncSession, tenant_id: uuid.UUID, code: str) -> uuid.UUID | None:
    """Resolves a chart-of-accounts code to its account id, self-healing by
    creating it from DEFAULT_ACCOUNTS if a tenant seeded their chart before
    this code existed (e.g. VAT Payable added later) — so posting logic
    never silently no-ops just because a tenant hasn't re-run the seed."""
    repo = AccountRepository(db)
    acc = await repo.get_by_code(tenant_id, code)
    if acc is not None:
        return acc.id
    default = next((d for d in DEFAULT_ACCOUNTS if d[0] == code), None)
    if default is None:
        return None
    _, name, type_, normal_balance = default
    acc = await repo.save(Account(tenant_id=tenant_id, code=code, name=name, type=type_, normal_balance=normal_balance))
    return acc.id


# Maps an Order.payment_method value to the (code, label) of the asset
# account that actually received the money. "card" settles to the bank
# account, same as a bank transfer — Pesaa doesn't model a separate card
# clearing account. Anything not listed here (including None) is treated as
# unpaid at sale time and goes to Accounts Receivable instead.
_PAYMENT_METHOD_ACCOUNTS: dict[str, tuple[str, str]] = {
    "cash": ("1000", "Cash"),
    "bank": ("1010", "Bank"),
    "card": ("1010", "Bank"),
    "mobile": ("1020", "Mobile Money"),
    "mobile_money": ("1020", "Mobile Money"),
    "mobile money": ("1020", "Mobile Money"),
    "bank transfer": ("1010", "Bank"),
    "bank_transfer": ("1010", "Bank"),
}


async def create_sale_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    order_id: uuid.UUID,
    total: float,
    order_number: str,
    cogs: float = 0.0,
    tax: float = 0.0,
    payment_method: str | None = None,
    amount_paid: float | None = None,
) -> uuid.UUID | None:
    """Auto-called when an order is Completed. Returns the posted
    transaction's id (or None if accounts weren't seeded yet) so the
    checkout's first OrderPayment row can keep a stable pointer to the
    accounting entry that actually covers it.

    Debits whichever account(s) the money actually landed in: the
    payment-method account (Cash/Bank/Mobile Money) for however much was
    paid right away, and Accounts Receivable for anything still owed — a
    sale with no payment info at all (payment_method=None, e.g. a manually
    invoiced order) debits AR for the full total, same as before this
    routing existed. `amount_paid` is capped at `total`; any excess is
    change handed back to the customer, not money the business is owed or
    banked twice.

    Credits Revenue for the net (VAT-exclusive) amount and VAT Payable for
    the tax portion — `total` is VAT-inclusive throughout Pesaa, so
    Revenue must never include the tax collected on the business's behalf.
    Also Debit COGS / Credit Inventory for the cost of goods sold, if any.
    """
    rev_id = await _get_account_by_code(db, tenant_id, "4000")
    ar_id = await _get_account_by_code(db, tenant_id, "1100")
    if not rev_id or not ar_id:
        return None  # accounts not seeded yet — skip silently

    paid = 0.0
    method_id = None
    method_label = None
    if payment_method and amount_paid:
        code, method_label = _PAYMENT_METHOD_ACCOUNTS.get(payment_method.lower(), ("1000", "Cash"))
        method_id = await _get_account_by_code(db, tenant_id, code)
        if method_id is not None:
            paid = round(min(float(amount_paid), total), 2)
    credit_remaining = round(total - paid, 2)

    net_revenue = round(total - tax, 2)

    repo = TransactionRepository(db)
    reference = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        currency_code=await _ledger_currency(db, tenant_id),
        reference=reference,
        type="sale",
        status="Posted",
        transaction_date=datetime.now(UTC).date(),
        description=f"Sale {order_number}",
        order_id=order_id,
        created_by=user_id,
    )
    txn = await repo.save(txn)

    if paid > 0 and method_id is not None:
        db.add(TransactionLine(transaction_id=txn.id, account_id=method_id, type="debit", amount=paid, description=method_label))
    if credit_remaining > 0:
        db.add(TransactionLine(transaction_id=txn.id, account_id=ar_id, type="debit", amount=credit_remaining, description="Accounts Receivable"))

    db.add(TransactionLine(transaction_id=txn.id, account_id=rev_id, type="credit", amount=net_revenue, description="Sales Revenue"))

    if tax > 0:
        vat_id = await _get_account_by_code(db, tenant_id, "2100")
        if vat_id:
            db.add(TransactionLine(transaction_id=txn.id, account_id=vat_id, type="credit", amount=round(tax, 2), description="VAT Payable"))

    if cogs > 0:
        cogs_id = await _get_account_by_code(db, tenant_id, "5000")
        inv_id = await _get_account_by_code(db, tenant_id, "1200")
        if cogs_id and inv_id:
            db.add(TransactionLine(transaction_id=txn.id, account_id=cogs_id, type="debit",  amount=round(cogs, 2), description="Cost of Goods Sold"))
            db.add(TransactionLine(transaction_id=txn.id, account_id=inv_id,  type="credit", amount=round(cogs, 2), description="Inventory"))

    return txn.id


async def create_expense_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    expense_id: uuid.UUID,
    amount: float,
    reference: str,
    expense_account_id: uuid.UUID | None,
    payment_method: str = "Cash",
    payment_date: date | None = None,
    branch_id: uuid.UUID | None = None,
) -> None:
    """Auto-called when expense is Approved. Debit Expense account, Credit Cash."""
    code, method_label = _PAYMENT_METHOD_ACCOUNTS.get(payment_method.lower(), ("1000", "Cash"))
    cash_id = await _get_account_by_code(db, tenant_id, code)
    exp_id = expense_account_id or await _get_account_by_code(db, tenant_id, "5900")
    if not cash_id or not exp_id:
        return

    repo = TransactionRepository(db)
    txn_ref = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        currency_code=await _ledger_currency(db, tenant_id),
        reference=txn_ref,
        type="expense",
        status="Posted",
        transaction_date=payment_date or datetime.now(UTC).date(),
        branch_id=branch_id,
        description=f"Expense {reference}",
        created_by=user_id,
    )
    txn = await repo.save(txn)
    db.add(TransactionLine(transaction_id=txn.id, account_id=exp_id,  type="debit",  amount=amount, description="Expense"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=cash_id, type="credit", amount=amount, description=method_label))


async def create_return_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    return_id: uuid.UUID,
    refund_amount: float,
    return_number: str,
) -> None:
    """Auto-called when a return is Approved. Debit Revenue (reversal), Credit AR."""
    ar_id = await _get_account_by_code(db, tenant_id, "1100")
    rev_id = await _get_account_by_code(db, tenant_id, "4000")
    if not ar_id or not rev_id:
        return

    repo = TransactionRepository(db)
    reference = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        currency_code=await _ledger_currency(db, tenant_id),
        reference=reference,
        type="return",
        status="Posted",
        transaction_date=datetime.now(UTC).date(),
        description=f"Return {return_number}",
        return_id=return_id,
        created_by=user_id,
    )
    txn = await repo.save(txn)
    db.add(TransactionLine(transaction_id=txn.id, account_id=rev_id, type="debit",  amount=refund_amount, description="Revenue Reversal"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=ar_id,  type="credit", amount=refund_amount, description="Accounts Receivable"))


async def create_purchase_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    purchase_id: uuid.UUID,
    total: float,
    reference: str,
) -> None:
    """Auto-called when a purchase order is received and its supplier bill is
    raised. Debit Inventory, Credit Accounts Payable — receiving goods creates
    a liability to the supplier, not an assumption that they were paid in
    cash on the spot. See create_supplier_payment_transaction for the
    settlement of that liability."""
    inv_id = await _get_account_by_code(db, tenant_id, "1200")
    ap_id = await _get_account_by_code(db, tenant_id, "2000")
    if not inv_id or not ap_id:
        return  # accounts not seeded yet — skip silently

    repo = TransactionRepository(db)
    txn_ref = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        currency_code=await _ledger_currency(db, tenant_id),
        reference=txn_ref,
        type="purchase",
        status="Posted",
        transaction_date=datetime.now(UTC).date(),
        description=f"Purchase {reference}",
        purchase_id=purchase_id,
        created_by=user_id,
    )
    txn = await repo.save(txn)
    db.add(TransactionLine(transaction_id=txn.id, account_id=inv_id, type="debit",  amount=total, description="Inventory"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=ap_id,  type="credit", amount=total, description="Accounts Payable"))


async def create_supplier_payment_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    purchase_id: uuid.UUID | None,
    amount: float | Decimal,
    reference: str,
    payment_method: str | None,
    ap_amount: float | Decimal | None = None,
    payment_date: date | None = None,
    branch_id: uuid.UUID | None = None,
) -> None:
    """Auto-called when a supplier bill payment is recorded. Debit Accounts
    Payable (reduces the liability), Credit whichever asset account the money
    actually came from — resolved the same way a customer payment is.

    All amounts are in the ledger (base) currency. ``amount`` is the cash that left;
    ``ap_amount`` is the payable carrying value it clears (defaults to ``amount``: no FX).
    When a foreign bill is paid at a different rate than it was booked at, the difference is a
    realised FX gain (paid less base than carried) or loss (paid more), posted to 4900 / 5950."""
    ap_id = await _get_account_by_code(db, tenant_id, "2000")
    code, label = _PAYMENT_METHOD_ACCOUNTS.get((payment_method or "").lower(), ("1000", "Cash"))
    method_id = await _get_account_by_code(db, tenant_id, code)
    if not ap_id or not method_id:
        return  # accounts not seeded yet — skip silently

    repo = TransactionRepository(db)
    txn_ref = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        currency_code=await _ledger_currency(db, tenant_id),
        reference=txn_ref,
        type="supplier_payment",
        status="Posted",
        transaction_date=payment_date or datetime.now(UTC).date(),
        description=f"Supplier payment {reference}",
        purchase_id=purchase_id,
        branch_id=branch_id,
        created_by=user_id,
    )
    txn = await repo.save(txn)
    cash = to_decimal(amount)
    carried = cash if ap_amount is None else to_decimal(ap_amount)
    db.add(TransactionLine(transaction_id=txn.id, account_id=ap_id,     type="debit",  amount=carried, description="Accounts Payable"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=method_id, type="credit", amount=cash, description=label))
    diff = cash - carried  # paid more base currency than the liability was carried at → loss
    if diff > ZERO:
        await _add_fx_line(db, tenant_id, txn.id, gain=False, amount=diff)
    elif diff < ZERO:
        await _add_fx_line(db, tenant_id, txn.id, gain=True, amount=-diff)


async def create_customer_payment_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    order_id: uuid.UUID | None,
    amount: float | Decimal,
    reference: str,
    payment_method: str | None,
    ar_amount: float | Decimal | None = None,
    payment_date: date | None = None,
    branch_id: uuid.UUID | None = None,
) -> uuid.UUID | None:
    """Auto-called when a customer payment is recorded against an order's
    outstanding balance (credit sale or partial-payment follow-up). Debit
    whichever asset account the money actually landed in, Credit Accounts
    Receivable (reduces the receivable) — the mirror image of
    create_supplier_payment_transaction on the payable side. Returns the
    posted transaction's id so the payment row can keep a stable pointer to
    it (needed to reverse the entry later).

    All amounts are in the ledger (base) currency. ``amount`` is the cash received;
    ``ar_amount`` is the receivable carrying value it clears (defaults to ``amount``: no FX).
    A foreign invoice paid at a different rate than it was booked at leaves a realised FX gain
    (received more base than carried) or loss, posted to 4900 / 5950 so the entry balances."""
    ar_id = await _get_account_by_code(db, tenant_id, "1100")
    code, label = _PAYMENT_METHOD_ACCOUNTS.get((payment_method or "").lower(), ("1000", "Cash"))
    method_id = await _get_account_by_code(db, tenant_id, code)
    if not ar_id or not method_id:
        return None  # accounts not seeded yet — skip silently

    repo = TransactionRepository(db)
    txn_ref = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        currency_code=await _ledger_currency(db, tenant_id),
        reference=txn_ref,
        type="customer_payment",
        status="Posted",
        transaction_date=payment_date or datetime.now(UTC).date(),
        description=f"Customer payment {reference}",
        order_id=order_id,
        branch_id=branch_id,
        created_by=user_id,
    )
    txn = await repo.save(txn)
    cash = to_decimal(amount)
    carried = cash if ar_amount is None else to_decimal(ar_amount)
    db.add(TransactionLine(transaction_id=txn.id, account_id=method_id, type="debit",  amount=cash, description=label))
    db.add(TransactionLine(transaction_id=txn.id, account_id=ar_id,     type="credit", amount=carried, description="Accounts Receivable"))
    diff = cash - carried  # received more base currency than the receivable was carried at → gain
    if diff > ZERO:
        await _add_fx_line(db, tenant_id, txn.id, gain=True, amount=diff)
    elif diff < ZERO:
        await _add_fx_line(db, tenant_id, txn.id, gain=False, amount=-diff)
    return txn.id


async def create_payment_reversal_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    order_id: uuid.UUID | None,
    amount: float | Decimal,
    reference: str,
    payment_method: str | None,
    ar_amount: float | Decimal | None = None,
) -> uuid.UUID | None:
    """Auto-called when a customer payment is reversed. Posts the exact
    opposite of create_customer_payment_transaction — Debit Accounts
    Receivable (the balance is owed again), Credit the payment-method
    account (the money is no longer counted as collected) — rather than
    deleting the original entry, so the ledger keeps a full, auditable
    history of both the payment and its reversal. The reversal uses the amounts the payment
    was ORIGINALLY posted with (``amount`` cash, ``ar_amount`` carrying value) — never today's
    exchange rate — and unwinds the original realised FX line."""
    ar_id = await _get_account_by_code(db, tenant_id, "1100")
    code, label = _PAYMENT_METHOD_ACCOUNTS.get((payment_method or "").lower(), ("1000", "Cash"))
    method_id = await _get_account_by_code(db, tenant_id, code)
    if not ar_id or not method_id:
        return None

    repo = TransactionRepository(db)
    txn_ref = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        currency_code=await _ledger_currency(db, tenant_id),
        reference=txn_ref,
        type="payment_reversal",
        status="Posted",
        transaction_date=datetime.now(UTC).date(),
        description=f"Reversal of payment {reference}",
        order_id=order_id,
        created_by=user_id,
    )
    txn = await repo.save(txn)
    cash = to_decimal(amount)
    carried = cash if ar_amount is None else to_decimal(ar_amount)
    db.add(TransactionLine(transaction_id=txn.id, account_id=ar_id,     type="debit",  amount=carried, description="Accounts Receivable"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=method_id, type="credit", amount=cash, description=label))
    diff = cash - carried
    if diff > ZERO:
        await _add_fx_line(db, tenant_id, txn.id, gain=True, amount=diff, reverse=True)
    elif diff < ZERO:
        await _add_fx_line(db, tenant_id, txn.id, gain=False, amount=-diff, reverse=True)
    return txn.id


async def backfill_sale_transactions(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
) -> int:
    """Create Posted sale transactions for every Completed order that has no accounting transaction yet."""
    from sqlalchemy import select as sa_select

    from app.modules.sales.models.order import Order

    ar_id = await _get_account_by_code(db, tenant_id, "1100")
    rev_id = await _get_account_by_code(db, tenant_id, "4000")
    if not ar_id or not rev_id:
        return 0

    # find completed orders with no linked accounting transaction
    result = await db.execute(
        sa_select(Order).where(
            Order.tenant_id == tenant_id,
            Order.status == "Completed",
            ~Order.id.in_(
                sa_select(Transaction.order_id).where(
                    Transaction.tenant_id == tenant_id,
                    Transaction.order_id.isnot(None),
                )
            ),
        )
    )
    orders = result.scalars().all()

    repo = TransactionRepository(db)
    count = 0
    for order in orders:
        reference = await repo.next_reference(tenant_id)
        txn = Transaction(
            tenant_id=tenant_id,
            currency_code=await _ledger_currency(db, tenant_id),
            reference=reference,
            type="sale",
            status="Posted",
            transaction_date=order.ordered_at.date() if order.ordered_at else datetime.now(UTC).date(),
            description=f"Sale {order.order_number}",
            order_id=order.id,
            created_by=user_id,
        )
        txn = await repo.save(txn)
        order_tax = float(order.tax or 0)
        net_revenue = round(float(order.total) - order_tax, 2)
        db.add(TransactionLine(transaction_id=txn.id, account_id=ar_id,  type="debit",  amount=float(order.total), description="Accounts Receivable"))
        db.add(TransactionLine(transaction_id=txn.id, account_id=rev_id, type="credit", amount=net_revenue, description="Sales Revenue"))
        if order_tax > 0:
            vat_id = await _get_account_by_code(db, tenant_id, "2100")
            if vat_id:
                db.add(TransactionLine(transaction_id=txn.id, account_id=vat_id, type="credit", amount=round(order_tax, 2), description="VAT Payable"))
        count += 1

    await db.commit()
    return count
