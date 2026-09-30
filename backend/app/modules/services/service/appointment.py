import uuid
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.hr.repository import EmployeeRepository
from app.modules.services.models.appointment import (
    APPOINTMENT_STATUSES,
    Appointment,
    AppointmentService,
)
from app.modules.services.repository import AppointmentRepository, ServiceRepository
from app.modules.services.schemas import AppointmentCreate, AppointmentRead, AppointmentUpdate


async def get_appointment(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> AppointmentRead:
    obj = await AppointmentRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Appointment not found")
    return AppointmentRead.model_validate(obj)


async def list_appointments(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    offset: int = 0,
    limit: int = 20,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: str | None = None,
    employee_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None,
    search: str | None = None,
) -> list[AppointmentRead]:
    items = await AppointmentRepository(db).list_for_tenant(
        tenant_id, offset, limit, date_from, date_to, status, employee_id, branch_id, search
    )
    return [AppointmentRead.model_validate(i) for i in items]


async def count_appointments(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: str | None = None,
    employee_id: uuid.UUID | None = None,
    branch_id: uuid.UUID | None = None,
    search: str | None = None,
) -> int:
    return await AppointmentRepository(db).count_for_tenant(
        tenant_id, date_from, date_to, status, employee_id, branch_id, search
    )


async def create_appointment(db: AsyncSession, tenant_id: uuid.UUID, data: AppointmentCreate) -> AppointmentRead:
    service_repo = ServiceRepository(db)
    lines: list[AppointmentService] = []
    total_minutes = 0
    employee_ids: set[uuid.UUID] = set()
    if data.employee_id is not None:
        employee_ids.add(data.employee_id)

    for item in data.services:
        service = await service_repo.get_by_id_for_tenant(tenant_id, item.service_id)
        if service is None:
            raise NotFoundError(f"Service {item.service_id} not found")
        line_employee_id = item.employee_id or data.employee_id
        if line_employee_id is not None:
            employee_ids.add(line_employee_id)
        lines.append(
            AppointmentService(
                service_id=service.id,
                service_name=service.name,
                employee_id=line_employee_id,
                duration_minutes=service.duration_minutes,
                price=service.price,
            )
        )
        total_minutes += service.duration_minutes

    for employee_id in employee_ids:
        employee = await EmployeeRepository(db).get_by_id_for_tenant(tenant_id, employee_id)
        if employee is None:
            raise NotFoundError(f"Employee {employee_id} not found")

    scheduled_end = data.scheduled_start + timedelta(minutes=total_minutes)

    repo = AppointmentRepository(db)
    for employee_id in employee_ids:
        overlapping = await repo.find_overlapping_for_employee(tenant_id, employee_id, data.scheduled_start, scheduled_end)
        if overlapping:
            raise ConflictError(
                f"That staff member already has an appointment overlapping "
                f"{data.scheduled_start.strftime('%H:%M')}–{scheduled_end.strftime('%H:%M')}"
            )

    obj = Appointment(
        tenant_id=tenant_id,
        branch_id=data.branch_id,
        customer_id=data.customer_id,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        employee_id=data.employee_id,
        status="scheduled",
        scheduled_start=data.scheduled_start,
        scheduled_end=scheduled_end,
        notes=data.notes,
        services=lines,
    )
    obj = await repo.save(obj)
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    await db.commit()
    return AppointmentRead.model_validate(obj)


async def update_appointment(
    db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: AppointmentUpdate
) -> AppointmentRead:
    repo = AppointmentRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Appointment not found")

    if data.status is not None and data.status not in APPOINTMENT_STATUSES:
        raise ValidationError(f"status must be one of {', '.join(APPOINTMENT_STATUSES)}")

    payload = data.model_dump(exclude_unset=True, exclude={"scheduled_start"})
    for field, value in payload.items():
        setattr(obj, field, value)

    if data.scheduled_start is not None:
        duration = obj.scheduled_end - obj.scheduled_start
        obj.scheduled_start = data.scheduled_start
        obj.scheduled_end = data.scheduled_start + duration

    if data.scheduled_start is not None or data.employee_id is not None:
        employee_id = obj.employee_id
        if employee_id is not None:
            overlapping = await repo.find_overlapping_for_employee(
                tenant_id, employee_id, obj.scheduled_start, obj.scheduled_end, exclude_appointment_id=obj.id
            )
            if overlapping:
                raise ConflictError(
                    f"That staff member already has an appointment overlapping "
                    f"{obj.scheduled_start.strftime('%H:%M')}–{obj.scheduled_end.strftime('%H:%M')}"
                )

    obj = await repo.save(obj)
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    await db.commit()
    return AppointmentRead.model_validate(obj)


async def delete_appointment(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = AppointmentRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Appointment not found")
    await repo.delete(obj)
    await db.commit()
