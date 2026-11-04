"""Sharing an invoice as a document: a signed link anyone with it can open (no login), and email with the PDF attached.
The link carries only the order id, tenant id and an expiry, signed with the server secret; it grants read access to
that one invoice PDF and nothing else."""
import html
import uuid
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_email_message
from app.core.exceptions import ValidationError
from app.modules.audit.service import record_audit
from app.modules.sales.service.invoice_pdf import _load_tenant, generate_order_invoice_pdf
from app.modules.sales.service.order import get_order

SHARE_DAYS = 30


def make_share_token(tenant_id: uuid.UUID, order_id: uuid.UUID, days: int = SHARE_DAYS) -> tuple[str, datetime]:
    expires = datetime.now(UTC) + timedelta(days=days)
    token = jwt.encode({"type": "invoice_share", "tid": str(tenant_id), "oid": str(order_id), "exp": expires}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token, expires


def read_share_token(token: str) -> tuple[uuid.UUID, uuid.UUID] | None:
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if claims.get("type") != "invoice_share":
            return None
        return uuid.UUID(claims["tid"]), uuid.UUID(claims["oid"])
    except (JWTError, KeyError, ValueError):
        return None


async def share_link(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID, user) -> dict:
    order = await get_order(db, tenant_id, order_id)  # also proves the invoice belongs to this business
    token, expires = make_share_token(tenant_id, order_id)
    url = f"{settings.API_PUBLIC_URL.rstrip('/')}/api/v1/global/invoices/{token}"
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="invoice.share_link",
                       entity_type="order", entity_id=str(order_id), summary=f"Created a share link for {order.order_number}", changes={"expires": expires.isoformat()})
    await db.commit()
    customer = order.customer
    return {"url": url, "expires_at": expires.isoformat(), "order_number": order.order_number, "customer_name": customer.name if customer else None,
            "customer_phone": customer.phone if customer else None, "customer_email": customer.email if customer else None}


async def email_invoice(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID, user, to: str | None, message: str | None) -> dict:
    order = await get_order(db, tenant_id, order_id)
    recipient = (to or (order.customer.email if order.customer else None) or "").strip()
    if not recipient:
        raise ValidationError("Enter the email address to send this invoice to; the customer has none on file")
    tenant = await _load_tenant(db, tenant_id)
    filename, pdf = await generate_order_invoice_pdf(db, tenant_id, order_id)
    note = f"<p>{html.escape(message)}</p>" if message else ""
    greeting = f"Dear {html.escape(order.customer.name)}," if order.customer else "Hello,"
    body = f"<p>{greeting}</p><p>Please find invoice {html.escape(order.order_number)} from {html.escape(tenant.name)} attached.</p>{note}<p>Thank you.</p>"
    sent = await send_email_message(recipient, f"Invoice {order.order_number} from {tenant.name}", body, attachments=[(filename, "application/pdf", pdf)])
    if not sent:
        raise ValidationError("The email could not be sent. Check the address and try again, or share a link instead.")
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="invoice.email", entity_type="order",
                       entity_id=str(order_id), summary=f"Emailed {order.order_number} to {recipient}", changes={"to": recipient})
    await db.commit()
    return {"sent_to": recipient}
