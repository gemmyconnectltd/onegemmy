import uuid
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.integrations.storage import storage
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.audit.service import record_audit
from app.modules.procurement.models import PurchaseAttachment
from app.modules.procurement.repository.attachment import PurchaseAttachmentRepository

MAX_SIZE = 5 * 1024 * 1024


def attachment_type(content: bytes) -> tuple[str, str]:
    if content.startswith(b"%PDF-"):
        return "application/pdf", ".pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    raise ValidationError("Attachments must be PDF, PNG or JPEG files")


def public_attachment(obj: PurchaseAttachment) -> dict:
    return {"id": str(obj.id), "name": obj.name, "size": obj.size, "created_at": obj.created_at}


async def attach(db: AsyncSession, tenant_id: uuid.UUID, order_id: uuid.UUID,
                 actor_id: uuid.UUID, filename: str, content: bytes) -> dict:
    if not content or len(content) > MAX_SIZE:
        raise ValidationError("Attachments must be non-empty and no larger than 5 MB")
    content_type, suffix = attachment_type(content)
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = PurchaseAttachmentRepository(db)
    if await repo.count_order(tenant_id, order_id) >= 10:
        raise ValidationError("A purchase supports at most ten attachments")
    key = await storage.save(f"private/purchases/{tenant_id}", f"document{suffix}", content)
    try:
        obj = PurchaseAttachment(tenant_id=tenant_id, purchase_order_id=order_id,
            name=Path(filename).name[:255], storage_key=key, content_type=content_type,
            size=len(content), created_by=actor_id)
        await repo.save(obj)
        await record_audit(db, tenant_id=tenant_id, actor_user_id=actor_id, action="purchase.attachment",
            entity_type="purchase", entity_id=str(order_id), summary="Attached a purchase document")
        await db.commit()
        return public_attachment(obj)
    except BaseException:
        await storage.delete(key)
        raise
