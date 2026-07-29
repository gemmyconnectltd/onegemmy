import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.tenants.models import Department
from app.modules.tenants.repository import DepartmentRepository
from app.modules.tenants.schemas import DepartmentCreate, DepartmentRead, DepartmentUpdate


async def get_department(db: AsyncSession, tenant_id: uuid.UUID, dept_id: uuid.UUID) -> DepartmentRead:
    dept = await DepartmentRepository(db).get_by_id_for_tenant(tenant_id, dept_id)
    if dept is None:
        raise NotFoundError("Department not found")
    return DepartmentRead.model_validate(dept)


async def list_departments(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[DepartmentRead]:
    depts = await DepartmentRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [DepartmentRead.model_validate(d) for d in depts]


async def count_departments(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await DepartmentRepository(db).count_for_tenant(tenant_id)


async def create_department(db: AsyncSession, tenant_id: uuid.UUID, data: DepartmentCreate) -> DepartmentRead:
    existing = await DepartmentRepository(db).get_by_name(tenant_id, data.name)
    if existing:
        raise ConflictError("Department with this name already exists")
    dept = Department(tenant_id=tenant_id, name=data.name, description=data.description)
    dept = await DepartmentRepository(db).save(dept)
    await db.commit()
    return DepartmentRead.model_validate(dept)


async def update_department(db: AsyncSession, tenant_id: uuid.UUID, dept_id: uuid.UUID, data: DepartmentUpdate) -> DepartmentRead:
    dept = await DepartmentRepository(db).get_by_id_for_tenant(tenant_id, dept_id)
    if dept is None:
        raise NotFoundError("Department not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)
    dept = await DepartmentRepository(db).save(dept)
    await db.commit()
    return DepartmentRead.model_validate(dept)


async def delete_department(db: AsyncSession, tenant_id: uuid.UUID, dept_id: uuid.UUID) -> None:
    dept = await DepartmentRepository(db).get_by_id_for_tenant(tenant_id, dept_id)
    if dept is None:
        raise NotFoundError("Department not found")
    await DepartmentRepository(db).delete(dept)
    await db.commit()
