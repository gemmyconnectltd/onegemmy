import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.service.transaction import (
    create_customer_payment_transaction,
    create_payment_reversal_transaction,
)
from app.modules.audit.service import record_audit
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

    outstanding = round(float(order.total) - float(order.amount_paid), 2)
    if outstanding <= _PAID_EPSILON:
        raise ValidationError("This order is already fully paid")
    if data.amount > outstanding + _PAID_EPSILON:
        raise ValidationError(f"Payment of {data.amount} exceeds the remaining balance of {outstanding}")

    reference = await payment_repo.next_reference(tenant_id)
    paid_at = data.paid_at or datetime.now(UTC)
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
        paid_at=paid_at if paid_at.tzinfo else paid_at.replace(tzinfo=UTC),
        received_by=user_id,
        client_payment_id=data.client_payment_id,
    )
    db.add(payment)
    await db.flush()

    txn_id = await create_customer_payment_transaction(
        db, tenant_id, user_id, order.id, data.amount, reference, data.payment_method,
    )
    payment.accounting_transaction_id = txn_id

    order.amount_paid = round(float(order.amount_paid) + data.amount, 2)
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

    order_repo = OrderRepository(db)
    order = await order_repo.get_by_id_for_tenant(tenant_id, payment.order_id)
    if order is None:
        raise NotFoundError("Order not found")

    await create_payment_reversal_transaction(
        db, tenant_id, user_id, order.id, float(payment.amount), payment.reference, payment.payment_method,
    )

    now = datetime.now(UTC)
    payment.status = "Reversed"
    payment.reversed_at = now
    payment.reversed_by = user_id
    payment.reversal_reason = data.reason
    await payment_repo.save(payment)

    order.amount_paid = round(max(0.0, float(order.amount_paid) - float(payment.amount)), 2)
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
