import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.purchase_item import PurchaseItem


def _with_relations():
    return [
        selectinload(PurchaseOrder.supplier),
        selectinload(PurchaseOrder.items).selectinload(PurchaseItem.product),
    ]


class PurchaseOrderRepository(BaseRepository[PurchaseOrder]):
    model = PurchaseOrder

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseOrder | None:
        result = await self.db.execute(
            select(PurchaseOrder).options(*_with_relations())
            .where(PurchaseOrder.id == id, PurchaseOrder.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[PurchaseOrder]:
        stmt = select(PurchaseOrder).options(*_with_relations()).where(PurchaseOrder.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(PurchaseOrder.status == status)
        stmt = stmt.order_by(PurchaseOrder.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(PurchaseOrder.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant_id)
        )
        count = result.scalar_one()
        return f"PUR-{str(count + 1).zfill(4)}"
