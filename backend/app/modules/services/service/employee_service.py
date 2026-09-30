import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.hr.repository import EmployeeRepository
from app.modules.services.models.employee_service import EmployeeService
from app.modules.services.repository import EmployeeServiceRepository, ServiceRepository
from app.modules.services.schemas import (
    EmployeeServiceCreate,
    EmployeeServiceRead,
    EmployeeServiceUpdate,
)

_VALID_COMMISSION_TYPES = {"percentage", "fixed", None}


async def list_employee_services_for_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> list[EmployeeServiceRead]:
    items = await EmployeeServiceRepository(db).list_for_tenant(tenant_id)
    return [EmployeeServiceRead.model_validate(i) for i in items]


async def list_employee_services_for_employee(
    db: AsyncSession, tenant_id: uuid.UUID, employee_id: uuid.UUID
) -> list[EmployeeServiceRead]:
    # Confirms the employee is actually this tenant's before listing, so a
    # caller can't fish for another tenant's staff-service assignments by id.
    if await EmployeeRepository(db).get_by_id_for_tenant(tenant_id, employee_id) is None:
        raise NotFoundError("Employee not found")
    items = await EmployeeServiceRepository(db).list_for_employee(employee_id)
    return [EmployeeServiceRead.model_validate(i) for i in items]


async def create_employee_service(
    db: AsyncSession, tenant_id: uuid.UUID, data: EmployeeServiceCreate
) -> EmployeeServiceRead:
    if data.commission_type not in _VALID_COMMISSION_TYPES:
        raise ValidationError("commission_type must be 'percentage', 'fixed', or omitted")

    employee = await EmployeeRepository(db).get_by_id_for_tenant(tenant_id, data.employee_id)
    if employee is None:
        raise NotFoundError("Employee not found")
    service = await ServiceRepository(db).get_by_id_for_tenant(tenant_id, data.service_id)
    if service is None:
        raise NotFoundError("Service not found")

    existing = await EmployeeServiceRepository(db).get_by_employee_and_service(data.employee_id, data.service_id)
    if existing is not None:
        raise ConflictError(f"{employee.full_name} is already configured for {service.name}")

    obj = EmployeeService(**data.model_dump())
    obj = await EmployeeServiceRepository(db).save(obj)
    obj = await EmployeeServiceRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    await db.commit()
    return EmployeeServiceRead.model_validate(obj)


async def update_employee_service(
    db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: EmployeeServiceUpdate
) -> EmployeeServiceRead:
    obj = await EmployeeServiceRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Staff service assignment not found")
    payload = data.model_dump(exclude_unset=True)
    if "commission_type" in payload and payload["commission_type"] not in _VALID_COMMISSION_TYPES:
        raise ValidationError("commission_type must be 'percentage', 'fixed', or omitted")
    for field, value in payload.items():
        setattr(obj, field, value)
    obj = await EmployeeServiceRepository(db).save(obj)
    obj = await EmployeeServiceRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    await db.commit()
    return EmployeeServiceRead.model_validate(obj)


async def delete_employee_service(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await EmployeeServiceRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Staff service assignment not found")
    await EmployeeServiceRepository(db).delete(obj)
    await db.commit()
