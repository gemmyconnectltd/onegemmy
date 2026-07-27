import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.modules.permissions.models import Permission
from app.modules.permissions.repository import PermissionRepository
from app.modules.permissions.schemas import PermissionCreate, PermissionUpdate

log = get_logger("permissions")


async def get_by_id(db: AsyncSession, permission_id: uuid.UUID) -> Permission:
    perm = await PermissionRepository(db).get(permission_id)
    if perm is None:
        log.warning("permissions.get_by_id.not_found", extra={"_extra_fields": {"permission_id": str(permission_id)}})
        raise NotFoundError("Permission not found")
    return perm


async def get_by_name(db: AsyncSession, name: str) -> Permission | None:
    return await PermissionRepository(db).get_by_name(name)


async def create(db: AsyncSession, data: PermissionCreate) -> Permission:
    log.info("permissions.create.attempt", extra={"_extra_fields": {"name": data.name, "resource": data.resource, "action": data.action}})

    existing = await get_by_name(db, data.name)
    if existing:
        log.warning("permissions.create.conflict", extra={"_extra_fields": {"name": data.name}})
        raise ConflictError("Permission with this name already exists")

    perm = Permission(
        name=data.name,
        description=data.description,
        resource=data.resource,
        action=data.action,
    )
    perm = await PermissionRepository(db).save(perm)
    log.info("permissions.create.success", extra={"_extra_fields": {"permission_id": str(perm.id), "name": perm.name}})
    return perm


async def list_all(db: AsyncSession, offset: int = 0, limit: int = 100) -> list[Permission]:
    return await PermissionRepository(db).list_all(offset, limit)


async def count_all(db: AsyncSession) -> int:
    return await PermissionRepository(db).count_all()


async def update(db: AsyncSession, perm: Permission, data: PermissionUpdate) -> Permission:
    fields = list(data.model_dump(exclude_unset=True).keys())
    log.info("permissions.update.attempt", extra={"_extra_fields": {"permission_id": str(perm.id), "fields": fields}})

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(perm, field, value)
    perm = await PermissionRepository(db).save(perm)
    log.info("permissions.update.success", extra={"_extra_fields": {"permission_id": str(perm.id)}})
    return perm


async def delete(db: AsyncSession, perm: Permission) -> None:
    log.info("permissions.delete.attempt", extra={"_extra_fields": {"permission_id": str(perm.id), "name": perm.name}})
    await PermissionRepository(db).delete(perm)
    log.info("permissions.delete.success", extra={"_extra_fields": {"permission_id": str(perm.id)}})


async def assign_to_role(db: AsyncSession, role_id: uuid.UUID, permission_ids: list[uuid.UUID]) -> None:
    log.info("permissions.assign_to_role.attempt", extra={"_extra_fields": {
        "role_id": str(role_id),
        "permission_count": len(permission_ids),
        "permission_ids": [str(p) for p in permission_ids],
    }})
    for pid in permission_ids:
        await get_by_id(db, pid)
    await PermissionRepository(db).assign_permissions_to_role(role_id, permission_ids)
    log.info("permissions.assign_to_role.success", extra={"_extra_fields": {"role_id": str(role_id)}})


async def get_for_role(db: AsyncSession, role_id: uuid.UUID) -> list[Permission]:
    return await PermissionRepository(db).get_permissions_for_role(role_id)


async def get_for_user(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> list[Permission]:
    return await PermissionRepository(db).get_permissions_for_user(tenant_id, role_id)


async def check_permission(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID, permission_name: str) -> bool:
    perms = await get_for_user(db, tenant_id, role_id)
    result = any(p.name == permission_name for p in perms)
    log.debug("permissions.check", extra={"_extra_fields": {
        "tenant_id": str(tenant_id),
        "role_id": str(role_id),
        "permission": permission_name,
        "result": result,
    }})
    return result
