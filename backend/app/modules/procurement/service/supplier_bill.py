import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

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
    read.balance = round(float(obj.amount) - float(obj.amount_paid), 2)
    # What is still owed, in base currency, at the bill's own frozen rate (the payable the ledger carries).
    read.base_balance = to_decimal(read.balance) * document_rate(obj)
    return read


async def list_bills(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[SupplierBillRead]:
    items = await SupplierBillRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [_to_read(i) for i in items]


async def count_bills(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await SupplierBillRepository(db).count_for_tenant(tenant_id, status)


async def get_bill(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> SupplierBillRead:
    obj = await SupplierBillRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier bill not found")
    return _to_read(obj)


async def create_bill_for_purchase(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, purchase: PurchaseOrder, due_date: date | None = None) -> SupplierBill:
    """Called when a Purchase Order is received — raises the supplier bill
    (the actual liability) and posts Dr Inventory / Cr Accounts Payable.
    Does not commit; the caller (receive_purchase/_apply_receive) does."""
    if due_date and due_date < datetime.now(UTC).date():
        raise ValidationError("Supplier due date cannot precede the bill date")
    repo = SupplierBillRepository(db)
    reference = await repo.next_reference(tenant_id)
    bill = SupplierBill(
        tenant_id=tenant_id,
        reference=reference,
        purchase_order_id=purchase.id,
        supplier_id=purchase.supplier_id,
        amount=purchase.total,
        amount_paid=0,
        status="Unpaid",
        bill_date=datetime.now(UTC).date(),
        due_date=due_date,
        created_by=user_id,
        # The bill is denominated like its purchase order and inherits the rate frozen at receipt.
        currency_code=purchase.currency_code,
        exchange_rate=purchase.exchange_rate,
        base_amount=purchase.base_total if purchase.base_total is not None else purchase.total,
    )
    bill = await repo.save(bill)
    # The ledger is in base currency: Dr Inventory / Cr Accounts Payable at the converted value.
    base_total = purchase.base_total if purchase.base_total is not None else purchase.total
    await create_purchase_transaction(db, tenant_id, user_id, purchase.id, float(base_total), purchase.reference)
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
        base_applied_so_far = sum(
            (Decimal(p.base_applied_amount) if p.base_applied_amount is not None else Decimal(p.amount) for p in bill.payments),
            Decimal(0),
        )
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


async def list_payments(db: AsyncSession, tenant_id: uuid.UUID, bill_id: uuid.UUID) -> list[SupplierPaymentRead]:
    payments = await SupplierPaymentRepository(db).list_for_bill(tenant_id, bill_id)
    return [SupplierPaymentRead.model_validate(p) for p in payments]
