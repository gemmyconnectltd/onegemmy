import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.procurement.models import GoodsReceipt, PurchaseOrder


class ReceiptRepository(BaseRepository[GoodsReceipt]):
    model = GoodsReceipt

    async def by_client(self, tenant_id: uuid.UUID, reference: str) -> GoodsReceipt | None:
        return await self.db.scalar(select(GoodsReceipt).options(selectinload(GoodsReceipt.lines))
            .where(GoodsReceipt.tenant_id == tenant_id, GoodsReceipt.client_reference == reference))

    async def page(self, tenant_id: uuid.UUID, branch_id: uuid.UUID | None,
                   order_id: uuid.UUID | None, offset: int, limit: int) -> tuple[list[GoodsReceipt], int]:
        conditions = [GoodsReceipt.tenant_id == tenant_id]
        if branch_id:
            conditions.append(GoodsReceipt.branch_id == branch_id)
        if order_id:
            conditions.append(GoodsReceipt.purchase_order_id == order_id)
        total = await self.db.scalar(select(func.count()).select_from(GoodsReceipt).where(*conditions))
        rows = await self.db.scalars(select(GoodsReceipt).options(
            selectinload(GoodsReceipt.lines),
            selectinload(GoodsReceipt.purchase_order).selectinload(PurchaseOrder.supplier))
            .where(*conditions).order_by(GoodsReceipt.received_at.desc(), GoodsReceipt.id)
            .offset(offset).limit(limit))
        return list(rows), total or 0

    async def received_amount(self, tenant_id: uuid.UUID, order_id: uuid.UUID):
        return await self.db.scalar(select(func.coalesce(func.sum(GoodsReceipt.amount), 0))
            .where(GoodsReceipt.tenant_id == tenant_id, GoodsReceipt.purchase_order_id == order_id))
