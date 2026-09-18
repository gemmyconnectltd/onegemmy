import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.procurement.models.requisition import PurchaseRequisition
from app.modules.procurement.repository.requisition import RequisitionRepository
from app.modules.procurement.schemas.requisition import RequisitionCreate, RequisitionRead


def _to_read(obj: PurchaseRequisition) -> RequisitionRead:
    read = RequisitionRead.model_validate(obj)
    read.department_name = obj.department.name if obj.department else None
    read.requested_by_name = obj.requester.full_name if obj.requester else None
    return read


async def list_requisitions(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[RequisitionRead]:
    items = await RequisitionRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [_to_read(i) for i in items]


async def count_requisitions(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await RequisitionRepository(db).count_for_tenant(tenant_id, status)


async def get_requisition(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> RequisitionRead:
    obj = await RequisitionRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Requisition not found")
    return _to_read(obj)


async def create_requisition(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: RequisitionCreate) -> RequisitionRead:
    repo = RequisitionRepository(db)
    reference = await repo.next_reference(tenant_id)
    obj = PurchaseRequisition(
        tenant_id=tenant_id,
        reference=reference,
        item_name=data.item_name,
        quantity=data.quantity,
        department_id=data.department_id,
        notes=data.notes,
        requested_by=user_id,
        status="Pending",
    )
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return _to_read(obj)


async def _decide(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, status: str) -> RequisitionRead:
    repo = RequisitionRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Requisition not found")
    if obj.status != "Pending":
        raise ValidationError(f"Cannot decide a requisition with status '{obj.status}'")
    obj.status = status
    obj.decided_by = user_id
    obj.decided_at = datetime.now(UTC)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return _to_read(obj)


async def approve_requisition(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID) -> RequisitionRead:
    return await _decide(db, tenant_id, id, user_id, "Approved")


async def reject_requisition(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID) -> RequisitionRead:
    return await _decide(db, tenant_id, id, user_id, "Rejected")


async def delete_requisition(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = RequisitionRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Requisition not found")
    if obj.status != "Pending":
        raise ValidationError("Only pending requisitions can be deleted")
    await repo.delete(obj)
    await db.commit()
