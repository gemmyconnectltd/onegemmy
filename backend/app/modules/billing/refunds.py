import uuid
from decimal import Decimal

from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, ValidationError
from app.modules.billing import provider
from app.modules.billing.models import BillingInvoice, BillingPayment, BillingRefund
from app.modules.billing.money import rounded_ratio
from app.modules.billing.repository import (
    BillingRepository,
    refund_reference,
    refund_reserved,
    refund_tax_to_date,
    serialize,
)
from app.modules.billing.schemas import RefundRequest
from app.modules.billing.service import audit, authorize, notice, operation_end, operation_start
from app.modules.tenants.models import User


async def initiate(
    db: AsyncSession, actor: User, payment_reference: uuid.UUID, data: RefundRequest, key: str
) -> dict:
    authorize(actor, "update", platform=True)
    repo = BillingRepository(db)
    scope = f"refund:{actor.id}"
    old, fingerprint = await operation_start(
        repo, scope, key, {"payment": payment_reference, **data.model_dump()}
    )
    if old is not None:
        return old
    payment = await repo.payment_reference(payment_reference)
    if payment is None or payment.status != "succeeded":
        raise ValidationError("Only a verified payment can be refunded")
    await repo.tenant(payment.tenant_id, lock=True)
    # Tenant lock serializes refund reservations with settlement and other refunds.
    reserved = await refund_reserved(db, payment.id)
    if data.amount > payment.amount - reserved:
        raise ValidationError("Refund exceeds the unrefunded payment balance")
    config = await provider.methods()
    method = next(
        (
            m
            for m in config["methods"]
            if m["provider"] == payment.method and m["currency"] == payment.currency
        ),
        None,
    )
    if method is None or not method.get("refunds_supported"):
        raise ValidationError("Refunds are not enabled for this payment provider")
    invoice = await repo.scoped(BillingInvoice, payment.tenant_id, payment.invoice_id)
    refunded_amount, refunded_tax = await refund_tax_to_date(db, invoice.id)
    tax = rounded_ratio(invoice.tax * (refunded_amount + data.amount), invoice.total) - refunded_tax
    number = await repo.next_invoice_number()
    row = BillingRefund(
        tenant_id=payment.tenant_id,
        payment_id=payment.id,
        reference=uuid.uuid4(),
        number=f"CN-{number:09d}",
        amount=data.amount,
        currency=payment.currency,
        status="pending",
        reason=data.reason,
        document=jsonable_encoder(
            {
                "bill_to": invoice.bill_to,
                "invoice_number": invoice.number,
                "currency_decimals": invoice.currency_decimals,
                "period_start": invoice.period_start,
                "period_end": invoice.period_end,
                "tax": tax,
            }
        ),
    )
    db.add(row)
    await db.flush()
    await audit(
        db,
        actor,
        row.tenant_id,
        "refund_requested",
        row,
        {"payment_reference": str(payment_reference), **data.model_dump()},
    )
    await operation_end(db, scope, key, fingerprint, serialize(row))
    try:
        return await reconcile(db, row.reference)
    except AppError:
        return serialize(row)  # Uncertain result remains reserved until provider reconciliation.


async def reconcile(db: AsyncSession, reference: uuid.UUID) -> dict:
    repo = BillingRepository(db)
    row = await refund_reference(db, reference)
    if row is None:
        return {"received": True}
    await repo.tenant(row.tenant_id, lock=True)
    row = await repo.scoped(BillingRefund, row.tenant_id, row.id, lock=True)
    if row.status in {"succeeded", "failed"}:
        return serialize(row)
    payment = await repo.scoped(BillingPayment, row.tenant_id, row.payment_id)
    response = await provider.call("GET", f"/v2/refunds/{reference}")
    if response.get("status") == "NOT_FOUND" and row.status == "pending":
        response = await provider.call(
            "POST",
            "/v2/refunds",
            {
                "refundId": str(reference),
                "depositId": str(payment.reference),
                "amount": provider.amount_string(row.amount, row.document["currency_decimals"]),
                "currency": row.currency,
                "clientReferenceId": row.number,
            },
        )
        if response.get("status") in {"ACCEPTED", "DUPLICATE_IGNORED", "DELAYED"}:
            row.status = "processing"
        elif response.get("status") == "REJECTED":
            row.status = "failed"
        await db.commit()
        return serialize(row)
    data = response.get("data", {})
    if response.get("status") != "FOUND":
        return serialize(row)
    try:
        matches = (
            data.get("refundId") == str(reference)
            and data.get("depositId") == str(payment.reference)
            and data.get("currency") == row.currency
            and Decimal(str(data.get("amount"))) * 10 ** row.document["currency_decimals"]
            == row.amount
        )
    except ArithmeticError:
        matches = False
    if not matches:
        raise ConflictError("Verified refund does not match the authorized refund")
    if data.get("status") in {"COMPLETED", "FAILED"}:
        row.status = "succeeded" if data["status"] == "COMPLETED" else "failed"
        await audit(db, None, row.tenant_id, "refund_verified", row, {"status": row.status})
        await notice(
            db,
            row.tenant_id,
            f"refund:{row.id}",
            "Pesaa refund update",
            f"Refund {row.number}: {row.status}. Your original invoice and payment remain on record.",
        )
        await db.commit()
    return serialize(row)
