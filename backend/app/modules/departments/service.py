import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.modules.departments.models import Department
from app.modules.departments.repository import DepartmentRepository
from app.modules.departments.schemas import DepartmentCreate, DepartmentUpdate

log = get_logger("departments")


async def get_by_id(db: AsyncSession, tenant_id: uuid.UUID, dept_id: uuid.UUID) -> Department:
    dept = await DepartmentRepository(db).get_by_id_for_tenant(tenant_id, dept_id)
    if dept is None:
        log.warning("departments.get_by_id.not_found", extra={"_extra_fields": {"dept_id": str(dept_id), "tenant_id": str(tenant_id)}})
        raise NotFoundError("Department not found")
    return dept


async def list_for_tenant(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Department]:
    return await DepartmentRepository(db).list_for_tenant(tenant_id, offset, limit)


async def count_for_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await DepartmentRepository(db).count_for_tenant(tenant_id)


async def create(db: AsyncSession, tenant_id: uuid.UUID, data: DepartmentCreate) -> Department:
    log.info("departments.create.attempt", extra={"_extra_fields": {"name": data.name, "tenant_id": str(tenant_id)}})

    existing = await DepartmentRepository(db).get_by_name(tenant_id, data.name)
    if existing:
        log.warning("departments.create.conflict", extra={"_extra_fields": {"name": data.name}})
        raise ConflictError("Department with this name already exists")

    dept = Department(tenant_id=tenant_id, name=data.name, description=data.description)
    dept = await DepartmentRepository(db).save(dept)
    log.info("departments.create.success", extra={"_extra_fields": {"dept_id": str(dept.id)}})
    return dept


async def update(db: AsyncSession, dept: Department, data: DepartmentUpdate) -> Department:
    fields = list(data.model_dump(exclude_unset=True).keys())
    log.info("departments.update.attempt", extra={"_extra_fields": {"dept_id": str(dept.id), "fields": fields}})

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)
    dept = await DepartmentRepository(db).save(dept)
    log.info("departments.update.success", extra={"_extra_fields": {"dept_id": str(dept.id)}})
    return dept


async def delete(db: AsyncSession, dept: Department) -> None:
    log.info("departments.delete.attempt", extra={"_extra_fields": {"dept_id": str(dept.id), "name": dept.name}})
    await DepartmentRepository(db).delete(dept)
    log.info("departments.delete.success", extra={"_extra_fields": {"dept_id": str(dept.id)}})
