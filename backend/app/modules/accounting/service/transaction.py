import uuid
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.repository import AccountRepository, TransactionRepository
from app.modules.accounting.schemas import TransactionCreate, TransactionRead, TransactionUpdate
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
    acc = await AccountRepository(db).get_by_code(tenant_id, code)
    return acc.id if acc else None


async def create_sale_transaction(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    order_id: uuid.UUID,
    total: float,
    order_number: str,
) -> None:
    """Auto-called when an order is Completed. Debit AR, Credit Revenue."""
    ar_id = await _get_account_by_code(db, tenant_id, "1100")
    rev_id = await _get_account_by_code(db, tenant_id, "4000")
    if not ar_id or not rev_id:
        return  # accounts not seeded yet — skip silently

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
    db.add(TransactionLine(transaction_id=txn.id, account_id=ar_id,  type="debit",  amount=total, description="Accounts Receivable"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=rev_id, type="credit", amount=total, description="Sales Revenue"))


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
    """Auto-called when a purchase order is received. Debit Inventory, Credit Cash."""
    inv_id = await _get_account_by_code(db, tenant_id, "1200")
    cash_id = await _get_account_by_code(db, tenant_id, "1000")
    if not inv_id or not cash_id:
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
    db.add(TransactionLine(transaction_id=txn.id, account_id=inv_id,  type="debit",  amount=total, description="Inventory"))
    db.add(TransactionLine(transaction_id=txn.id, account_id=cash_id, type="credit", amount=total, description="Cash"))


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
        db.add(TransactionLine(transaction_id=txn.id, account_id=ar_id,  type="debit",  amount=float(order.total), description="Accounts Receivable"))
        db.add(TransactionLine(transaction_id=txn.id, account_id=rev_id, type="credit", amount=float(order.total), description="Sales Revenue"))
        count += 1

    await db.commit()
    return count
