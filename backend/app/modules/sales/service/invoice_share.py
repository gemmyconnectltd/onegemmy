"""Sharing an invoice or receipt as a document: the PDF itself is emailed as an attachment. There are no public links."""
import html
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_email_message
from app.core.exceptions import ValidationError
from app.modules.audit.service import record_audit
from app.modules.sales.service.invoice_pdf import _load_tenant, generate_order_invoice_pdf
from app.modules.sales.service.order import get_order


async def email_invoice(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID, user, to: str | None, message: str | None, kind: str = "invoice") -> dict:
    order = await get_order(db, tenant_id, order_id)
    recipient = (to or (order.customer.email if order.customer else None) or "").strip()
    if not recipient:
        raise ValidationError(f"Enter the email address to send this {kind} to; the customer has none on file")
    tenant = await _load_tenant(db, tenant_id)
    filename, pdf = await generate_order_invoice_pdf(db, tenant_id, order_id)
    note = f"<p>{html.escape(message)}</p>" if message else ""
    greeting = f"Dear {html.escape(order.customer.name)}," if order.customer else "Hello,"
    body = f"<p>{greeting}</p><p>Please find your {kind} {html.escape(order.order_number)} from {html.escape(tenant.name)} attached.</p>{note}<p>Thank you.</p>"
    sent = await send_email_message(recipient, f"{kind.title()} {order.order_number} from {tenant.name}", body, attachments=[(filename, "application/pdf", pdf)])
    if not sent:
        raise ValidationError("The email could not be sent. Check the address and try again, or share a link instead.")
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user.id, actor_name=user.full_name, action="invoice.email", entity_type="order",
                       entity_id=str(order_id), summary=f"Emailed {kind} {order.order_number} to {recipient}", changes={"to": recipient, "kind": kind})
    await db.commit()
    return {"sent_to": recipient}
