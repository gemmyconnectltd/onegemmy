import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.modules.roles.models import Role
from app.modules.roles.repository import RoleRepository
from app.modules.roles.schemas import RoleCreate, RoleUpdate

log = get_logger("roles")


async def get_by_id(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> Role:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        log.warning("roles.get_by_id.not_found", extra={"_extra_fields": {"role_id": str(role_id)}})
        raise NotFoundError("Role not found")
    return role


async def get_by_name(db: AsyncSession, tenant_id: uuid.UUID, name: str) -> Role | None:
    return await RoleRepository(db).get_by_name_for_tenant(tenant_id, name)


async def create(db: AsyncSession, tenant_id: uuid.UUID, data: RoleCreate) -> Role:
    log.info("roles.create.attempt", extra={"_extra_fields": {"name": data.name, "tenant_id": str(tenant_id)}})

    existing = await get_by_name(db, tenant_id, data.name)
    if existing:
        log.warning("roles.create.conflict", extra={"_extra_fields": {"name": data.name}})
        raise ConflictError("Role with this name already exists")

    role = Role(tenant_id=tenant_id, name=data.name, description=data.description)
    role = await RoleRepository(db).save(role)
    log.info("roles.create.success", extra={"_extra_fields": {"role_id": str(role.id), "name": role.name}})
    return role


async def list_for_tenant(
    db: AsyncSession, tenant_id: uuid.UUID, offset: int, limit: int
) -> list[Role]:
    return await RoleRepository(db).list_for_tenant(tenant_id, offset, limit)


async def count_for_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await RoleRepository(db).count_for_tenant(tenant_id)


async def update(db: AsyncSession, role: Role, data: RoleUpdate) -> Role:
    fields = list(data.model_dump(exclude_unset=True).keys())
    log.info("roles.update.attempt", extra={"_extra_fields": {"role_id": str(role.id), "fields": fields}})

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(role, field, value)
    role = await RoleRepository(db).save(role)
    log.info("roles.update.success", extra={"_extra_fields": {"role_id": str(role.id)}})
    return role


async def delete(db: AsyncSession, role: Role) -> None:
    log.info("roles.delete.attempt", extra={"_extra_fields": {"role_id": str(role.id), "name": role.name}})
    await RoleRepository(db).delete(role)
    log.info("roles.delete.success", extra={"_extra_fields": {"role_id": str(role.id)}})
