import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.procurement.models.requisition import PurchaseRequisition


def _with_relations():
    return [
        selectinload(PurchaseRequisition.department),
        selectinload(PurchaseRequisition.requester),
    ]


class RequisitionRepository(BaseRepository[PurchaseRequisition]):
    model = PurchaseRequisition

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseRequisition | None:
        result = await self.db.execute(
            select(PurchaseRequisition).options(*_with_relations())
            .where(PurchaseRequisition.id == id, PurchaseRequisition.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[PurchaseRequisition]:
        stmt = select(PurchaseRequisition).options(*_with_relations()).where(PurchaseRequisition.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(PurchaseRequisition.status == status)
        stmt = stmt.order_by(PurchaseRequisition.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(PurchaseRequisition).where(PurchaseRequisition.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(PurchaseRequisition.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        from sqlalchemy import Integer, cast

        result = await self.db.execute(
            select(func.max(cast(func.substring(PurchaseRequisition.reference, 5), Integer)))
            .where(PurchaseRequisition.tenant_id == tenant_id)
        )
        current_max = result.scalar_one() or 0
        return f"REQ-{str(current_max + 1).zfill(4)}"
