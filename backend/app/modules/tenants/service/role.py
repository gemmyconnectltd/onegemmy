import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.tenants.models import Role
from app.modules.tenants.repository import RoleRepository
from app.modules.tenants.schemas import RoleCreate, RoleRead, RoleUpdate


async def get_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> RoleRead:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    return RoleRead.model_validate(role)


async def get_role_by_name(db: AsyncSession, tenant_id: uuid.UUID, name: str) -> Role | None:
    return await RoleRepository(db).get_by_name_for_tenant(tenant_id, name)


async def create_role(db: AsyncSession, tenant_id: uuid.UUID, data: RoleCreate) -> RoleRead:
    existing = await get_role_by_name(db, tenant_id, data.name)
    if existing:
        raise ConflictError("Role with this name already exists")
    role = Role(tenant_id=tenant_id, name=data.name, description=data.description)
    role = await RoleRepository(db).save(role)
    await db.commit()
    return RoleRead.model_validate(role)


async def list_roles(db: AsyncSession, tenant_id: uuid.UUID, offset: int, limit: int) -> list[RoleRead]:
    roles = await RoleRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [RoleRead.model_validate(r) for r in roles]


async def count_roles(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await RoleRepository(db).count_for_tenant(tenant_id)


async def update_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID, data: RoleUpdate) -> RoleRead:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(role, field, value)
    role = await RoleRepository(db).save(role)
    await db.commit()
    return RoleRead.model_validate(role)


async def delete_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> None:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    await RoleRepository(db).delete(role)
    await db.commit()
