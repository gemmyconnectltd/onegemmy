import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.hr.repository import EmployeeRepository
from app.modules.services.models.queue_entry import QUEUE_STATUSES, QueueEntry
from app.modules.services.repository import QueueEntryRepository, ServiceRepository
from app.modules.services.schemas import QueueEntryCreate, QueueEntryRead, QueueEntryUpdate


async def list_queue_entries(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> list[QueueEntryRead]:
    items = await QueueEntryRepository(db).list_for_tenant(tenant_id, status)
    return [QueueEntryRead.model_validate(i) for i in items]


async def create_queue_entry(db: AsyncSession, tenant_id: uuid.UUID, data: QueueEntryCreate) -> QueueEntryRead:
    service = await ServiceRepository(db).get_by_id_for_tenant(tenant_id, data.service_id)
    if service is None:
        raise NotFoundError("Service not found")
    if data.employee_id is not None:
        employee = await EmployeeRepository(db).get_by_id_for_tenant(tenant_id, data.employee_id)
        if employee is None:
            raise NotFoundError("Employee not found")

    now = datetime.now(UTC)
    status = "waiting"
    started_at = None
    if data.employee_id is not None:
        status = "in_service" if data.start_now else "assigned"
        started_at = now if data.start_now else None

    obj = QueueEntry(
        tenant_id=tenant_id,
        branch_id=data.branch_id,
        customer_id=data.customer_id,
        customer_name=data.customer_name,
        service_id=service.id,
        service_name=service.name,
        employee_id=data.employee_id,
        status=status,
        started_at=started_at,
        notes=data.notes,
    )
    repo = QueueEntryRepository(db)
    obj = await repo.save(obj)
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    await db.commit()
    return QueueEntryRead.model_validate(obj)


async def update_queue_entry(
    db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: QueueEntryUpdate
) -> QueueEntryRead:
    repo = QueueEntryRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Queue entry not found")

    if data.status is not None and data.status not in QUEUE_STATUSES:
        raise ValidationError(f"status must be one of {', '.join(QUEUE_STATUSES)}")
    if data.employee_id is not None:
        employee = await EmployeeRepository(db).get_by_id_for_tenant(tenant_id, data.employee_id)
        if employee is None:
            raise NotFoundError("Employee not found")

    now = datetime.now(UTC)
    if data.employee_id is not None:
        obj.employee_id = data.employee_id
        if obj.status == "waiting":
            obj.status = "assigned"
    if data.notes is not None:
        obj.notes = data.notes
    if data.status is not None:
        obj.status = data.status
        if data.status == "in_service" and obj.started_at is None:
            obj.started_at = now
        if data.status == "completed" and obj.completed_at is None:
            obj.completed_at = now

    obj = await repo.save(obj)
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    await db.commit()
    return QueueEntryRead.model_validate(obj)


async def delete_queue_entry(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = QueueEntryRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Queue entry not found")
    await repo.delete(obj)
    await db.commit()
