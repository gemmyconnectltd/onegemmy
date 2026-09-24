import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.tenants.data.department_templates import DEPARTMENT_TEMPLATES
from app.modules.tenants.models import Department
from app.modules.tenants.repository import DepartmentRepository, TenantRepository
from app.modules.tenants.schemas import (
    DepartmentCreate,
    DepartmentImportResult,
    DepartmentRead,
    DepartmentTemplateRead,
    DepartmentTemplatesRead,
    DepartmentUpdate,
)


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


DEFAULT_DEPARTMENTS = [
    "Engineering",
    "Sales",
    "Marketing",
    "Finance",
    "Human Resources",
    "Operations",
]


async def seed_default_departments(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    repo = DepartmentRepository(db)
    existing = {d.name for d in await repo.list_for_tenant(tenant_id, limit=100)}
    for name in DEFAULT_DEPARTMENTS:
        if name not in existing:
            db.add(Department(tenant_id=tenant_id, name=name))
    await db.flush()


async def get_department_templates(db: AsyncSession, tenant_id: uuid.UUID) -> DepartmentTemplatesRead:
    tenant = await TenantRepository(db).get(tenant_id)
    existing = await DepartmentRepository(db).list_all_for_tenant(tenant_id)

    return DepartmentTemplatesRead(
        tenant_industry=tenant.industry if tenant else None,
        existing=[d.name for d in existing],
        templates=[DepartmentTemplateRead.model_validate(t) for t in DEPARTMENT_TEMPLATES],
    )


async def import_departments(db: AsyncSession, tenant_id: uuid.UUID, names: list[str]) -> DepartmentImportResult:
    existing = await DepartmentRepository(db).list_all_for_tenant(tenant_id)
    existing_names_lower = {d.name.strip().lower() for d in existing}

    created: list[DepartmentRead] = []
    skipped: list[str] = []
    for raw_name in names:
        name = raw_name.strip()
        if not name or name.lower() in existing_names_lower:
            skipped.append(raw_name)
            continue
        obj = Department(tenant_id=tenant_id, name=name)
        obj = await DepartmentRepository(db).save(obj)
        created.append(DepartmentRead.model_validate(obj))
        existing_names_lower.add(name.lower())

    await db.commit()
    return DepartmentImportResult(created=created, skipped=skipped)
