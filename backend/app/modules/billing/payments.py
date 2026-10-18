import base64
import hashlib
import json
import uuid
from decimal import Decimal, InvalidOperation

from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError, ConflictError, NotFoundError, ValidationError
from app.modules.billing import provider
from app.modules.billing.models import BillingInvoice, BillingPayment
from app.modules.billing.repository import BillingRepository, serialize
from app.modules.billing.schemas import PayRequest
from app.modules.billing.service import (
    audit,
    authorize,
    notice,
    operation_end,
    operation_start,
    sync_tenant,
)
from app.modules.tenants.models import User


def _cipher() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()))


def encrypted_payload(data: dict) -> str:
    return _cipher().encrypt(json.dumps(data).encode()).decode()


def decrypted_payload(data: str) -> dict:
    return json.loads(_cipher().decrypt(data.encode()))


async def initiate_payment(
    db: AsyncSession,
    actor: User,
    tenant_id: uuid.UUID,
    invoice_id: uuid.UUID,
    data: PayRequest,
    key: str,
) -> dict:
    own = authorize(actor, "update")
    if own is not None and own != tenant_id:
        raise ValidationError("Invalid billing account")
    if not provider.enabled():
        raise AppError("pawaPay payments are not configured", status_code=503)
    repo = BillingRepository(db)
    scope = f"payment:{tenant_id}:{actor.id}"
    # Hash phone into the fingerprint only; never persist the phone.
    old, fp = await operation_start(repo, scope, key, {"invoice": invoice_id, **data.model_dump()})
    if old is not None:
        return old
    await repo.tenant(tenant_id, lock=True)
    invoice = await repo.scoped(BillingInvoice, tenant_id, invoice_id, lock=True)
    if invoice.status not in {"open", "partially_paid", "overdue"} or invoice.paid >= invoice.total:
        raise ValidationError("This invoice has no payable balance")
    payment = await repo.payment_in_flight(invoice.id)
    if payment:
        raise ConflictError("A payment is already processing. Refresh its status before retrying")
    decimals = invoice.currency_decimals
    # Validate methods before creating the durable attempt, so validation never strands a payment.
    config = await provider.methods()
    if not any(
        m["provider"] == data.provider
        and m["currency"] == invoice.currency
        and data.phone.startswith(m["prefix"])
        for m in config["methods"]
    ):
        raise ValidationError("This mobile money provider is unavailable for your invoice")
    payment = BillingPayment(
        tenant_id=tenant_id,
        invoice_id=invoice.id,
        reference=uuid.uuid4(),
        amount=invoice.total - invoice.paid,
        currency=invoice.currency,
        status="pending",
        method=data.provider,
        provider_payload=encrypted_payload({"phone": data.phone, "provider": data.provider}),
    )
    db.add(payment)
    await db.flush()
    await audit(
        db,
        actor,
        tenant_id,
        "payment_initiated",
        payment,
        {"invoice_id": str(invoice.id), "amount": payment.amount, "currency": payment.currency},
    )
    # Persist reference and idempotency result BEFORE sending money-moving request.
    result = await operation_end(db, scope, key, fp, serialize(payment))
    try:
        response = await provider.initiate(
            payment.reference,
            payment.amount,
            payment.currency,
            decimals,
            data.phone,
            data.provider,
            invoice.number,
        )
    except ValidationError:
        # Local validation means the request was never sent. Terminal failure is safe here.
        await repo.tenant(tenant_id, lock=True)
        payment = await repo.scoped(BillingPayment, tenant_id, payment.id, lock=True)
        payment.status, payment.failure_reason = "failed", "PROVIDER_VALIDATION"
        payment.provider_payload = None
        await db.commit()
        raise
    except AppError:
        # Timeout is ambiguous: leave pending; only provider reconciliation resolves it.
        return {**result, "message": "Payment status is pending verification. Do not submit again."}
    await repo.tenant(tenant_id, lock=True)
    payment = await repo.scoped(BillingPayment, tenant_id, payment.id, lock=True)
    if payment.status not in {"succeeded", "failed"}:
        if response.get("status") == "REJECTED":
            payment.status = "failed"
            payment.failure_reason = "PROVIDER_REJECTED"
            payment.provider_payload = None
            await audit(db, None, tenant_id, "payment_failed", payment, {"status": "failed"})
            await notice(
                db,
                tenant_id,
                f"payment_failed:{payment.id}",
                "Pesaa payment failed",
                "Your payment was rejected. Open Plans & Billing to review and retry.",
            )
        elif response.get("status") in {"ACCEPTED", "DUPLICATE_IGNORED"}:
            payment.status = "processing"
            payment.provider_payload = None
    await db.commit()
    return serialize(payment)


async def reconcile(db: AsyncSession, reference: uuid.UUID, actor: User | None = None) -> dict:
    repo = BillingRepository(db)
    own = authorize(actor, "read") if actor else None
    payment = await repo.payment_reference(reference, own)
    if payment is None:
        if actor:
            raise NotFoundError("Payment not found")
        # Do not expose whether a callback guessed a real provider deposit.
        return {"received": True}
    if actor:
        own = authorize(actor, "read")
        if own is not None and own != payment.tenant_id:
            raise NotFoundError("Payment not found")
    await repo.tenant(payment.tenant_id, lock=True)
    payment = await repo.scoped(BillingPayment, payment.tenant_id, payment.id, lock=True)
    if payment.status == "succeeded":
        return serialize(payment)
    # Callback body is UNTRUSTED. No status, amount, or payer from it is used.
    verified = await provider.verify(reference)
    if verified is None:
        if payment.status == "pending" and payment.provider_payload:
            payload = decrypted_payload(payment.provider_payload)
            invoice = await repo.scoped(BillingInvoice, payment.tenant_id, payment.invoice_id)
            response = await provider.initiate(
                payment.reference,
                payment.amount,
                payment.currency,
                invoice.currency_decimals,
                payload["phone"],
                payload["provider"],
                invoice.number,
            )
            if response.get("status") in {"ACCEPTED", "DUPLICATE_IGNORED"}:
                payment.status, payment.provider_payload = "processing", None
            elif response.get("status") == "REJECTED":
                payment.status, payment.provider_payload = "failed", None
                payment.failure_reason = "PROVIDER_REJECTED"
            await db.commit()
        return serialize(payment)
    invoice = await repo.scoped(BillingInvoice, payment.tenant_id, payment.invoice_id, lock=True)
    decimals = invoice.currency_decimals
    try:
        matches = (
            verified.get("depositId") == str(reference)
            and verified.get("currency") == payment.currency
            and Decimal(str(verified.get("amount"))) * (10**decimals) == payment.amount
        )
    except InvalidOperation:
        matches = False
    if not matches:
        raise ConflictError("Provider payment identity, currency or amount does not match")
    status = verified.get("status")
    if status not in {"COMPLETED", "FAILED"}:
        return serialize(payment)
    payment.provider_payload = None
    if status == "FAILED":
        if payment.status != "failed":
            payment.status, payment.failure_reason = "failed", "PROVIDER_FAILED"
            await audit(
                db, None, payment.tenant_id, "payment_failed", payment, {"status": "failed"}
            )
            await notice(
                db,
                payment.tenant_id,
                f"payment_failed:{payment.id}",
                "Pesaa payment failed",
                "Payment failed. Review the invoice and try again in Plans & Billing.",
            )
    else:
        invoice = await repo.scoped(
            BillingInvoice, payment.tenant_id, payment.invoice_id, lock=True
        )
        if payment.amount > invoice.total - invoice.paid:
            raise ConflictError("Payment exceeds invoice balance; manual review required")
        payment.status, payment.provider_ref = "succeeded", str(reference)
        invoice.paid += payment.amount
        invoice.status = "paid" if invoice.paid == invoice.total else "partially_paid"
        await db.flush()
        sub = await repo.subscription(payment.tenant_id)
        if sub and invoice.status == "paid" and invoice.source_key.startswith("renewal:"):
            sub.period_start, sub.period_end = invoice.period_start, invoice.period_end
            sub.revision += 1
        if (
            sub
            and sub.status in {"past_due", "suspended"}
            and not await repo.pending_invoice(payment.tenant_id)
        ):
            sub.status = "active"
            sub.revision += 1
            await sync_tenant(repo, sub)
            await notice(
                db,
                payment.tenant_id,
                f"activated:{sub.id}:{sub.revision}",
                "Your Pesaa subscription is active",
                "Your verified payment activated your subscription. Thank you.",
            )
        await audit(
            db,
            None,
            payment.tenant_id,
            "payment_verified",
            payment,
            {"invoice_id": str(invoice.id), "amount": payment.amount, "currency": payment.currency},
        )
        await notice(
            db,
            payment.tenant_id,
            f"payment:{payment.id}",
            "Pesaa payment received",
            f"Payment for invoice {invoice.number} was verified. Your receipt is in Plans & Billing.",
        )
    await db.commit()
    return serialize(payment)
