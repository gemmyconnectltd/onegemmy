import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import ONE, compute_settlement, to_decimal
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.service.transaction import (
    create_customer_payment_transaction,
    create_payment_reversal_transaction,
)
from app.modules.audit.service import record_audit
from app.modules.currency.service import (
    document_currency,
    document_rate,
    get_base_currency,
    lookup_rate,
    require_active_currency,
)
from app.modules.sales.models.order_payment import OrderPayment
from app.modules.sales.repository import OrderPaymentRepository, OrderRepository
from app.modules.sales.schemas import (
    OrderPaymentCreate,
    OrderPaymentRead,
    OrderPaymentReverse,
    OrderRead,
)
from app.modules.sales.service.order import _PAID_EPSILON, _to_order_read

_REVERSIBLE_ONLY = "Completed"


def _to_payment_read(obj: OrderPayment) -> OrderPaymentRead:
    read = OrderPaymentRead.model_validate(obj)
    read.received_by_name = obj.receiver.full_name if getattr(obj, "receiver", None) else None
    return read


async def list_payments_for_order(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID) -> list[OrderPaymentRead]:
    order = await OrderRepository(db).get_by_id_for_tenant(tenant_id, order_id)
    if order is None:
        raise NotFoundError("Order not found")
    payments = await OrderPaymentRepository(db).list_for_order(tenant_id, order_id)
    return [_to_payment_read(p) for p in payments]


async def record_payment(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    user_name: str | None,
    order_id: uuid.UUID,
    data: OrderPaymentCreate,
) -> OrderRead:
    from app.modules.accounting.repository.reporting import ReportingRepository
    await ReportingRepository(db).lock_tenant(tenant_id)
    order_repo = OrderRepository(db)
    order = await order_repo.get_by_id_for_tenant(tenant_id, order_id)
    if order is None:
        raise NotFoundError("Order not found")
    if order.status != "Completed":
        raise ValidationError("Payments can only be recorded against a completed order")

    payment_repo = OrderPaymentRepository(db)

    # Idempotency: a resubmitted client_payment_id (double-click, retry)
    # returns the order as it stands, never records the money twice.
    if data.client_payment_id:
        existing = await payment_repo.find_by_client_payment_id(tenant_id, data.client_payment_id)
        if existing is not None:
            obj = await order_repo.get_by_id_for_tenant(tenant_id, existing.order_id)
            return _to_order_read(obj)

    base_ccy = await get_base_currency(db, tenant_id)
    doc_ccy = document_currency(order, base_ccy)
    pay_ccy = await require_active_currency(db, data.currency_code) if data.currency_code else doc_ccy
    paid_at = data.paid_at or datetime.now(UTC)
    paid_at = paid_at if paid_at.tzinfo else paid_at.replace(tzinfo=UTC)

    outstanding = round(float(order.total) - float(order.amount_paid), 2)
    if outstanding <= _PAID_EPSILON:
        raise ValidationError("This order is already fully paid")

    if doc_ccy == base_ccy and pay_ccy == base_ccy:
        # One currency end to end — the original, unchanged calculation (and no rate involved).
        if data.exchange_rate is not None and to_decimal(data.exchange_rate) != ONE:
            raise ValidationError(f"The exchange rate between {base_ccy} and itself must be 1")
        if data.amount > outstanding + _PAID_EPSILON:
            raise ValidationError(f"Payment of {data.amount} exceeds the remaining balance of {outstanding}")
        amt = to_decimal(data.amount)
        fields = {
            "currency_code": base_ccy, "exchange_rate": ONE, "base_amount": amt,
            "applied_amount": amt, "base_applied_amount": amt,
        }
        applied, base_cash, base_clears = data.amount, data.amount, data.amount
    else:
        # Foreign invoice and/or foreign cash. One rate is needed on the payment date: an explicit one
        # from the user, else the tenant/platform rate effective at paid_at — never an assumed 1.
        rate_pair = (pay_ccy, base_ccy) if doc_ccy == base_ccy else (doc_ccy, base_ccy)
        rate = data.exchange_rate if data.exchange_rate is not None else (await lookup_rate(db, tenant_id, *rate_pair, paid_at))[0]
        prior = [p for p in order.payments if p.status == _REVERSIBLE_ONLY]
        base_applied_so_far = sum(
            (Decimal(p.base_applied_amount) if p.base_applied_amount is not None else Decimal(p.amount) for p in prior), Decimal(0),
        )
        st = compute_settlement(
            doc_currency=doc_ccy, base_currency=base_ccy, doc_rate=document_rate(order), doc_total=order.total,
            doc_base_total=order.base_total if order.base_total is not None else order.total,
            paid_so_far=order.amount_paid, base_applied_so_far=base_applied_so_far,
            pay_currency=pay_ccy, pay_amount=data.amount, rate_at_payment=rate,
        )
        fields = {
            "currency_code": pay_ccy, "exchange_rate": st.payment_rate, "base_amount": st.base_amount,
            "applied_amount": st.applied_amount, "base_applied_amount": st.base_applied_amount,
        }
        applied, base_cash, base_clears = st.applied_amount, st.base_amount, st.base_applied_amount

    reference = await payment_repo.next_reference(tenant_id)
    payment = OrderPayment(
        tenant_id=tenant_id,
        reference=reference,
        order_id=order.id,
        customer_id=order.customer_id,
        branch_id=data.branch_id or order.branch_id,
        amount=data.amount,
        payment_method=data.payment_method,
        reference_number=data.reference_number,
        notes=data.notes,
        status="Completed",
        paid_at=paid_at,
        received_by=user_id,
        client_payment_id=data.client_payment_id,
        **fields,
    )
    db.add(payment)
    await db.flush()

    # The ledger is in base currency: cash at the payment-date rate, receivable cleared at the
    # invoice's own frozen rate, any difference booked as realised FX gain/loss.
    txn_id = await create_customer_payment_transaction(
        db, tenant_id, user_id, order.id, base_cash, reference, data.payment_method,
        ar_amount=base_clears, payment_date=paid_at.date(), branch_id=payment.branch_id,
    )
    payment.accounting_transaction_id = txn_id

    order.amount_paid = round(float(order.amount_paid) + float(applied), 2) if doc_ccy == base_ccy and pay_ccy == base_ccy else (
        Decimal(order.amount_paid) + Decimal(applied)
    )
    await order_repo.save(order)

    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="payment.create",
        entity_type="payment",
        entity_id=str(payment.id),
        summary=f"Recorded payment {reference} of {data.amount} against order {order.order_number}",
        changes={"order_id": str(order.id), "amount": data.amount, "payment_method": data.payment_method},
    )
    await db.commit()
    obj = await order_repo.get_by_id_for_tenant(tenant_id, order.id)
    return _to_order_read(obj)


async def reverse_payment(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    user_name: str | None,
    payment_id: uuid.UUID,
    data: OrderPaymentReverse,
) -> OrderRead:
    payment_repo = OrderPaymentRepository(db)
    payment = await payment_repo.get_by_id_for_tenant(tenant_id, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found")
    if payment.status != _REVERSIBLE_ONLY:
        raise ValidationError("This payment has already been reversed")

    from app.modules.accounting.repository.reporting import ReportingRepository
    await ReportingRepository(db).lock_tenant(tenant_id)
    order_repo = OrderRepository(db)
    order = await order_repo.get_by_id_for_tenant(tenant_id, payment.order_id)
    if order is None:
        raise NotFoundError("Order not found")

    # Reverse with the amounts the payment was ORIGINALLY posted with — base cash, receivable carrying
    # value and (implicitly) its FX result — never today's exchange rate. Rows from before
    # multi-currency have no base fields: they were base currency, so `amount` is all three.
    base_cash = payment.base_amount if payment.base_amount is not None else payment.amount
    base_clears = payment.base_applied_amount if payment.base_applied_amount is not None else base_cash
    applied = payment.applied_amount if payment.applied_amount is not None else payment.amount
    await create_payment_reversal_transaction(
        db, tenant_id, user_id, order.id, base_cash, payment.reference, payment.payment_method, ar_amount=base_clears,
    )

    now = datetime.now(UTC)
    payment.status = "Reversed"
    payment.reversed_at = now
    payment.reversed_by = user_id
    payment.reversal_reason = data.reason
    await payment_repo.save(payment)

    order.amount_paid = max(Decimal(0), to_decimal(order.amount_paid) - to_decimal(applied)).quantize(Decimal("0.01"))
    await order_repo.save(order)

    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="payment.reverse",
        entity_type="payment",
        entity_id=str(payment.id),
        summary=f"Reversed payment {payment.reference} ({payment.amount}) on order {order.order_number}",
        changes={"order_id": str(order.id), "amount": float(payment.amount), "reason": data.reason},
    )
    await db.commit()
    obj = await order_repo.get_by_id_for_tenant(tenant_id, order.id)
    return _to_order_read(obj)
