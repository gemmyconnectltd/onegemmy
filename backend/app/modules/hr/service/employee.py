import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.hr.models.employee import Employee
from app.modules.hr.repository import EmployeeRepository
from app.modules.hr.schemas import EmployeeCreate, EmployeeRead, EmployeeUpdate


async def list_employees(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[EmployeeRead]:
    items = await EmployeeRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [EmployeeRead.model_validate(i) for i in items]


async def count_employees(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await EmployeeRepository(db).count_for_tenant(tenant_id, status)


async def get_employee(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> EmployeeRead:
    obj = await EmployeeRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Employee not found")
    return EmployeeRead.model_validate(obj)


async def create_employee(db: AsyncSession, tenant_id: uuid.UUID, data: EmployeeCreate) -> EmployeeRead:
    repo = EmployeeRepository(db)
    code = data.employee_code or await repo.next_reference(tenant_id)
    obj = Employee(tenant_id=tenant_id, employee_code=code, **data.model_dump(exclude={"employee_code"}))
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return EmployeeRead.model_validate(obj)


async def update_employee(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: EmployeeUpdate) -> EmployeeRead:
    repo = EmployeeRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Employee not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return EmployeeRead.model_validate(obj)


async def delete_employee(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    repo = EmployeeRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Employee not found")
    await repo.delete(obj)
    await db.commit()
