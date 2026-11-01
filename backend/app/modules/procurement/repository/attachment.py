import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.procurement.models import PurchaseAttachment


class PurchaseAttachmentRepository(BaseRepository[PurchaseAttachment]):
    model = PurchaseAttachment

    async def for_order(self, tenant_id: uuid.UUID, order_id: uuid.UUID) -> list[PurchaseAttachment]:
        # Upload service enforces an absolute maximum of ten attachments per order.
        return list(await self.db.scalars(select(PurchaseAttachment).where(
            PurchaseAttachment.tenant_id == tenant_id, PurchaseAttachment.purchase_order_id == order_id)
            .order_by(PurchaseAttachment.created_at, PurchaseAttachment.id).limit(10)))

    async def count_order(self, tenant_id: uuid.UUID, order_id: uuid.UUID) -> int:
        return await self.db.scalar(select(func.count()).select_from(PurchaseAttachment).where(
            PurchaseAttachment.tenant_id == tenant_id, PurchaseAttachment.purchase_order_id == order_id)) or 0

    async def for_download(self, tenant_id: uuid.UUID, order_id: uuid.UUID, id: uuid.UUID):
        return await self.db.scalar(select(PurchaseAttachment).where(
            PurchaseAttachment.tenant_id == tenant_id, PurchaseAttachment.purchase_order_id == order_id,
            PurchaseAttachment.id == id))
