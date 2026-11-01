import uuid

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.purchase_return import PurchaseReturn


def _with_relations():
    return [
        selectinload(PurchaseReturn.purchase_order).selectinload(PurchaseOrder.supplier),
    ]


class PurchaseReturnRepository(BaseRepository[PurchaseReturn]):
    model = PurchaseReturn

    async def by_client(self, tenant_id: uuid.UUID, reference: str) -> PurchaseReturn | None:
        return await self.db.scalar(select(PurchaseReturn).options(*_with_relations()).where(
            PurchaseReturn.tenant_id == tenant_id, PurchaseReturn.client_reference == reference))

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseReturn | None:
        result = await self.db.execute(
            select(PurchaseReturn).options(*_with_relations())
            .where(PurchaseReturn.id == id, PurchaseReturn.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50, branch_id=None, search=None) -> list[PurchaseReturn]:
        stmt = (
            select(PurchaseReturn).options(*_with_relations())
            .where(PurchaseReturn.tenant_id == tenant_id)
            .order_by(PurchaseReturn.created_at.desc())
            .offset(offset).limit(limit)
        )
        if search:
            stmt = stmt.where(PurchaseReturn.reference.ilike(f"%{search}%") | PurchaseReturn.product_name.ilike(f"%{search}%"))
        if branch_id:
            stmt = stmt.join(PurchaseOrder, (PurchaseOrder.id == PurchaseReturn.purchase_order_id) & (PurchaseOrder.tenant_id == tenant_id)).where(PurchaseOrder.branch_id == branch_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, branch_id=None, search=None) -> int:
        stmt = select(func.count()).select_from(PurchaseReturn).where(PurchaseReturn.tenant_id == tenant_id)
        if search:
            stmt = stmt.where(PurchaseReturn.reference.ilike(f"%{search}%") | PurchaseReturn.product_name.ilike(f"%{search}%"))
        if branch_id:
            stmt = stmt.join(PurchaseOrder, (PurchaseOrder.id == PurchaseReturn.purchase_order_id) & (PurchaseOrder.tenant_id == tenant_id)).where(PurchaseOrder.branch_id == branch_id)
        return (await self.db.execute(stmt)).scalar_one()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.max(cast(func.substring(PurchaseReturn.reference, 5), Integer)))
            .where(PurchaseReturn.tenant_id == tenant_id)
        )
        current_max = result.scalar_one() or 0
        return f"PRT-{str(current_max + 1).zfill(4)}"
