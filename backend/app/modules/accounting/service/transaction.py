import uuid
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.repository import AccountRepository, TransactionRepository
from app.modules.accounting.schemas import TransactionCreate, TransactionRead, TransactionUpdate
from app.modules.accounting.service.account import DEFAULT_ACCOUNTS
from app.modules.audit.service import record_audit


async def list_transactions(db: AsyncSession, tenant_id: uuid.UUID, type: str | None = None, status: str | None = None, offset: int = 0, limit: int = 50) -> list[TransactionRead]:
    items = await TransactionRepository(db).list_for_tenant(tenant_id, type, status, offset, limit)
    return [TransactionRead.model_validate(i) for i in items]


async def count_transactions(db: AsyncSession, tenant_id: uuid.UUID, type: str | None = None, status: str | None = None) -> int:
    return await TransactionRepository(db).count_for_tenant(tenant_id, type, status)


async def get_transaction(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> TransactionRead:
    obj = await TransactionRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transaction not found")
    return TransactionRead.model_validate(obj)


async def create_transaction(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: TransactionCreate) -> TransactionRead:
    if len(data.lines) < 2:
        raise ValidationError("A transaction must have at least 2 lines")
    total_debits = sum(l.amount for l in data.lines if l.type == "debit")
    total_credits = sum(l.amount for l in data.lines if l.type == "credit")
    if round(total_debits, 2) != round(total_credits, 2):
        raise ValidationError(f"Debits ({total_debits}) must equal credits ({total_credits})")

    repo = TransactionRepository(db)
    reference = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        reference=reference,
        type=data.type,
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


async def update_transaction(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: TransactionUpdate) -> TransactionRead:
    repo = TransactionRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transaction not found")
    if obj.status == "Posted":
        raise ValidationError("Cannot edit a posted transaction — void it first")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return TransactionRead.model_validate(obj)


async def post_transaction(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None = None) -> TransactionRead:
    repo = TransactionRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transaction not found")
    if obj.status != "Draft":
        raise ValidationError(f"Cannot post a transaction with status '{obj.status}'")
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
    repo = TransactionRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Transaction not found")
    if obj.status == "Void":
        raise ValidationError("Transaction is already void")
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
) -> None:
    """Auto-called when an order is Completed.

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
        return  # accounts not seeded yet — skip silently

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


async def create_expense_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    expense_id: uuid.UUID,
    amount: float,
    reference: str,
    expense_account_id: uuid.UUID | None,
) -> None:
    """Auto-called when expense is Approved. Debit Expense account, Credit Cash."""
    cash_id = await _get_account_by_code(db, tenant_id, "1000")
    exp_id = expense_account_id or await _get_account_by_code(db, tenant_id, "5900")
    if not cash_id or not exp_id:
        return

    repo = TransactionRepository(db)
    txn_ref = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        reference=txn_ref,
        type="expense",
        status="Posted",
        transaction_date=datetime.now(UTC).date(),
        description=f"Expense {reference}",
        created_by=user_id,
    )
    txn = await repo.save(txn)
    db.add(TransactionLine(transaction_id=txn.id, account_id=exp_id,  type="debit",  amount=amount, description="Expense"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=cash_id, type="credit", amount=amount, description="Cash"))


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
    amount: float,
    reference: str,
    payment_method: str | None,
) -> None:
    """Auto-called when a supplier bill payment is recorded. Debit Accounts
    Payable (reduces the liability), Credit whichever asset account the money
    actually came from — resolved the same way a customer payment is."""
    ap_id = await _get_account_by_code(db, tenant_id, "2000")
    code, label = _PAYMENT_METHOD_ACCOUNTS.get((payment_method or "").lower(), ("1000", "Cash"))
    method_id = await _get_account_by_code(db, tenant_id, code)
    if not ap_id or not method_id:
        return  # accounts not seeded yet — skip silently

    repo = TransactionRepository(db)
    txn_ref = await repo.next_reference(tenant_id)
    txn = Transaction(
        tenant_id=tenant_id,
        reference=txn_ref,
        type="supplier_payment",
        status="Posted",
        transaction_date=datetime.now(UTC).date(),
        description=f"Supplier payment {reference}",
        purchase_id=purchase_id,
        created_by=user_id,
    )
    txn = await repo.save(txn)
    db.add(TransactionLine(transaction_id=txn.id, account_id=ap_id,     type="debit",  amount=round(amount, 2), description="Accounts Payable"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=method_id, type="credit", amount=round(amount, 2), description=label))


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
