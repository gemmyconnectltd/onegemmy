import uuid
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import ONE, compute_settlement, to_decimal
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.service.transaction import (
    create_purchase_transaction,
    create_supplier_payment_transaction,
)
from app.modules.currency.service import (
    document_currency,
    document_rate,
    get_base_currency,
    lookup_rate,
    require_active_currency,
)
from app.modules.procurement.models.purchase_item import PurchaseItem
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.supplier_bill import SupplierBill, SupplierPayment
from app.modules.procurement.repository import SupplierBillRepository, SupplierPaymentRepository
from app.modules.procurement.schemas.supplier_bill import (
    SupplierBillRead,
    SupplierPaymentCreate,
    SupplierPaymentRead,
)


def _to_read(obj: SupplierBill) -> SupplierBillRead:
    read = SupplierBillRead.model_validate(obj)
    read.po_reference = obj.purchase_order.reference if obj.purchase_order else None
    read.supplier_name = obj.supplier.name if obj.supplier else (obj.purchase_order.supplier.name if obj.purchase_order and obj.purchase_order.supplier else None)
    read.is_overdue = bool(obj.due_date and obj.due_date < datetime.now(UTC).date() and Decimal(obj.amount) > Decimal(obj.amount_paid))
    read.receipt_id = obj.receipt_id
    read.balance = float((Decimal(obj.amount) - Decimal(obj.amount_paid)).quantize(Decimal("0.01")))
    # What is still owed, in base currency, at the bill's own frozen rate (the payable the ledger carries).
    read.base_balance = to_decimal(read.balance) * document_rate(obj)
    return read


async def list_bills(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50, **filters) -> list[SupplierBillRead]:
    items = await SupplierBillRepository(db).list_for_tenant(tenant_id, status, offset, limit, **filters)
    return [_to_read(i) for i in items]


async def count_bills(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, **filters) -> int:
    return await SupplierBillRepository(db).count_for_tenant(tenant_id, status, **filters)


async def get_bill(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> SupplierBillRead:
    obj = await SupplierBillRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier bill not found")
    return _to_read(obj)


async def create_bill_for_purchase(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, purchase: PurchaseOrder, due_date: date | None = None, receipt=None) -> SupplierBill:
    """Called when a Purchase Order is received — raises the supplier bill
    (the actual liability) and posts Dr Inventory / Cr Accounts Payable.
    Does not commit; the caller (receive_purchase/_apply_receive) does."""
    if due_date and due_date < datetime.now(UTC).date():
        raise ValidationError("Supplier due date cannot precede the bill date")
    repo = SupplierBillRepository(db)
    reference = await repo.next_reference(tenant_id)
    amount = Decimal(receipt.amount) if receipt else Decimal(purchase.total)
    base_amount = (amount * document_rate(purchase)).quantize(Decimal("0.01"))
    if receipt and purchase.status == "Received":
        base_amount = Decimal(purchase.base_total) - Decimal(await repo.base_billed(tenant_id, purchase.id))
    bill = SupplierBill(
        tenant_id=tenant_id,
        reference=reference,
        purchase_order_id=purchase.id,
        supplier_id=purchase.supplier_id,
        amount=amount,
        receipt_id=receipt.id if receipt else None,
        amount_paid=0,
        status="Paid" if amount == 0 else "Unpaid",
        bill_date=datetime.now(UTC).date(),
        due_date=due_date,
        created_by=user_id,
        # The bill is denominated like its purchase order and inherits the rate frozen at receipt.
        currency_code=purchase.currency_code,
        exchange_rate=purchase.exchange_rate,
        base_amount=base_amount,
    )
    bill = await repo.save(bill)
    # The ledger is in base currency: Dr Inventory / Cr Accounts Payable at the converted value.
    from app.modules.procurement.service.purchase import recoverable_vat
    # `purchase` may arrive without its items loaded (e.g. freshly built in memory); a lazy load
    # would run sync IO inside the async loop, so fetch them explicitly when they are missing.
    if "items" in sa_inspect(purchase).unloaded:
        items = (await db.execute(
            select(PurchaseItem).where(PurchaseItem.purchase_order_id == purchase.id)
        )).scalars().all()
    else:
        items = purchase.items
    weights = {}
    received = {line.purchase_item_id: Decimal(line.quantity) for line in receipt.lines} if receipt else None
    subtotal = Decimal(str(purchase.subtotal or 0))
    discount_factor = (subtotal - Decimal(str(purchase.discount or 0))) / subtotal if subtotal else Decimal(1)
    vat_in_lines = Decimal(0)
    for item in items:
        quantity = received.get(item.id, Decimal(0)) if received is not None else Decimal(item.quantity)
        if quantity <= 0:
            continue
        key = item.expense_account_id if item.is_service else None
        share = quantity / Decimal(item.quantity)
        vat = Decimal(str(item.tax_amount)) * share * discount_factor if recoverable_vat(item) else Decimal(0)
        vat_in_lines += vat
        weights[key] = weights.get(key, Decimal(0)) + Decimal(item.line_total) * share * discount_factor - vat
    # Recoverable input VAT goes to Input VAT Recoverable; the rest of the bill is what the goods and services cost.
    input_vat = min((vat_in_lines * document_rate(purchase)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), base_amount) if vat_in_lines > 0 else Decimal(0)
    weight_total = sum(weights.values(), Decimal(0))
    allocated = {}
    remaining = base_amount - input_vat
    for index, (key, weight) in enumerate(weights.items()):
        value = remaining if index == len(weights) - 1 else ((base_amount - input_vat) * weight / weight_total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if weight_total else Decimal(0)
        allocated[key] = value
        remaining -= value
    expenses = {key: value for key, value in allocated.items() if key is not None}
    await create_purchase_transaction(db, tenant_id, user_id, purchase.id, base_amount,
        bill.reference, branch_id=purchase.branch_id, expense_allocations=expenses, input_vat=input_vat)
    return bill


async def record_payment(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, bill_id: uuid.UUID, data: SupplierPaymentCreate, actor=None) -> SupplierBillRead:
    from sqlalchemy import select

    from app.core.exceptions import ConflictError
    from app.modules.accounting.repository.reporting import ReportingRepository
    await ReportingRepository(db).lock_tenant(tenant_id)
    bill_repo = SupplierBillRepository(db)
    bill = await bill_repo.get_by_id_for_tenant(tenant_id, bill_id)
    if bill is None:
        raise NotFoundError("Supplier bill not found")
    payment_branch_id = bill.purchase_order.branch_id
    if actor is not None:
        from app.core.exceptions import ForbiddenError
        from app.modules.accounting.service.workspace import allow
        allow(actor, "accounts_payable", "create")
        if actor.tenant_id != tenant_id or (actor.branch_id and bill.purchase_order.branch_id != actor.branch_id):
            raise ForbiddenError("Supplier bill is outside the assigned business or branch")
    if data.client_reference:
        prior = (await db.execute(select(SupplierPayment).where(SupplierPayment.tenant_id == tenant_id, SupplierPayment.reference == data.client_reference))).scalar_one_or_none()
        if prior:
            if prior.bill_id != bill_id or Decimal(prior.amount) != data.amount or prior.payment_method != data.payment_method or (data.currency_code and prior.currency_code != data.currency_code) or (data.exchange_rate is not None and prior.exchange_rate != data.exchange_rate):
                raise ConflictError("Payment reference was already used with different details")
            return _to_read(bill)
    if bill.status == "Paid":
        raise ValidationError("This bill is already fully paid")

    base_ccy = await get_base_currency(db, tenant_id)
    bill_ccy = document_currency(bill, base_ccy)
    pay_ccy = await require_active_currency(db, data.currency_code) if data.currency_code else bill_ccy
    paid_at = data.paid_at or datetime.now(UTC)
    paid_at = paid_at if paid_at.tzinfo else paid_at.replace(tzinfo=UTC)
    if paid_at.date() > datetime.now(UTC).date() or paid_at.date() < bill.bill_date:
        raise ValidationError("Payment date must be between the bill date and today")

    balance = to_decimal(bill.amount) - to_decimal(bill.amount_paid)
    if bill_ccy == base_ccy and pay_ccy == base_ccy:
        # One currency end to end — the original, unchanged calculation (and no rate involved).
        if data.exchange_rate is not None and to_decimal(data.exchange_rate) != ONE:
            raise ValidationError(f"The exchange rate between {base_ccy} and itself must be 1")
        if data.amount > balance:
            raise ValidationError(f"Payment of {data.amount} exceeds the remaining balance of {balance}")
        amt = to_decimal(data.amount)
        fields = {
            "currency_code": base_ccy, "exchange_rate": ONE, "base_amount": amt,
            "applied_amount": amt, "base_applied_amount": amt,
        }
        applied, base_cash, base_clears = data.amount, data.amount, data.amount
    else:
        # Foreign bill and/or foreign cash: one rate is needed on the payment date — the user's, else
        # the tenant/platform rate in force now. Never an assumed 1.
        rate_pair = (pay_ccy, base_ccy) if bill_ccy == base_ccy else (bill_ccy, base_ccy)
        rate = data.exchange_rate if data.exchange_rate is not None else (await lookup_rate(db, tenant_id, *rate_pair, paid_at))[0]
        base_applied_so_far = await SupplierPaymentRepository(db).base_applied(tenant_id, bill.id)
        st = compute_settlement(
            doc_currency=bill_ccy, base_currency=base_ccy, doc_rate=document_rate(bill),
            doc_total=bill.amount, doc_base_total=bill.base_amount if bill.base_amount is not None else bill.amount,
            paid_so_far=bill.amount_paid, base_applied_so_far=base_applied_so_far,
            pay_currency=pay_ccy, pay_amount=data.amount, rate_at_payment=rate,
        )
        fields = {
            "currency_code": pay_ccy, "exchange_rate": st.payment_rate, "base_amount": st.base_amount,
            "applied_amount": st.applied_amount, "base_applied_amount": st.base_applied_amount,
        }
        applied, base_cash, base_clears = st.applied_amount, st.base_amount, st.base_applied_amount

    payment_repo = SupplierPaymentRepository(db)
    reference = data.client_reference or await payment_repo.next_reference(tenant_id)
    payment = SupplierPayment(
        tenant_id=tenant_id,
        reference=reference,
        bill_id=bill.id,
        amount=data.amount,
        payment_method=data.payment_method,
        paid_at=paid_at,
        created_by=user_id,
        **fields,
    )
    db.add(payment)

    if bill_ccy == base_ccy and pay_ccy == base_ccy:
        bill.amount_paid = to_decimal(bill.amount_paid) + data.amount
    else:
        bill.amount_paid = Decimal(bill.amount_paid) + Decimal(applied)
    bill.status = "Paid" if to_decimal(bill.amount_paid) >= to_decimal(bill.amount) else "PartiallyPaid"
    await bill_repo.save(bill)

    # Ledger in base currency: cash at the payment-date rate, payable cleared at the bill's own frozen
    # rate, any difference booked as realised FX gain/loss.
    await create_supplier_payment_transaction(
        db, tenant_id, user_id, bill.purchase_order_id, base_cash, reference,
        data.payment_method, ap_amount=base_clears, payment_date=paid_at.date(),
        branch_id=payment_branch_id,
    )

    await db.flush()
    from app.modules.audit.service import record_audit
    await record_audit(
        db, tenant_id=tenant_id, actor_user_id=user_id, action="supplier_payment.create",
        entity_type="supplier_payment", entity_id=str(payment.id),
        summary=f"Recorded supplier payment {reference}",
        actor_name=actor.full_name if actor else None,
        changes={"notes": data.notes, "reference_number": data.reference_number},
    )
    await db.commit()
    obj = await bill_repo.get_by_id_for_tenant(tenant_id, bill_id)
    return _to_read(obj)


async def list_payments(db: AsyncSession, tenant_id: uuid.UUID, bill_id: uuid.UUID, offset: int = 0, limit: int = 25) -> list[SupplierPaymentRead]:
    payments = await SupplierPaymentRepository(db).list_for_bill(tenant_id, bill_id, offset, limit)
    return [SupplierPaymentRead.model_validate(p) for p in payments]


async def update_bill_metadata(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID,
                               user_id: uuid.UUID, data) -> SupplierBillRead:
    from app.modules.accounting.repository.reporting import ReportingRepository
    from app.modules.audit.service import record_audit
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = SupplierBillRepository(db)
    bill = await repo.get_by_id_for_tenant(tenant_id, id)
    if bill is None:
        raise NotFoundError("Supplier bill not found")
    reference = data.supplier_invoice_reference.strip()
    if not reference:
        raise ValidationError("Supplier invoice reference is required")
    if not bill.supplier_id:
        raise ValidationError("A supplier is required before recording an invoice reference")
    if await repo.duplicate_invoice(tenant_id, bill.supplier_id, reference, id):
        raise ValidationError("This supplier invoice reference is already recorded")
    if data.due_date and data.due_date < bill.bill_date:
        raise ValidationError("Due date cannot precede bill date")
    bill.supplier_invoice_reference = reference
    bill.due_date = data.due_date
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id,
        action="supplier_bill.invoice", entity_type="purchase", entity_id=str(bill.purchase_order_id),
        summary=f"Recorded supplier invoice on {bill.reference}")
    await db.commit()
    return _to_read(bill)
