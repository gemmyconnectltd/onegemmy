import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.tenants.models import Permission
from app.modules.tenants.repository import PermissionRepository
from app.modules.tenants.schemas import PermissionCreate, PermissionRead, PermissionUpdate


async def get_permission(db: AsyncSession, permission_id: uuid.UUID) -> PermissionRead:
    perm = await PermissionRepository(db).get(permission_id)
    if perm is None:
        raise NotFoundError("Permission not found")
    return PermissionRead.model_validate(perm)


async def get_permission_by_name(db: AsyncSession, name: str) -> Permission | None:
    return await PermissionRepository(db).get_by_name(name)


async def create_permission(db: AsyncSession, data: PermissionCreate) -> PermissionRead:
    existing = await get_permission_by_name(db, data.name)
    if existing:
        raise ConflictError("Permission with this name already exists")
    perm = Permission(name=data.name, description=data.description, resource=data.resource, action=data.action)
    perm = await PermissionRepository(db).save(perm)
    await db.commit()
    return PermissionRead.model_validate(perm)


async def list_permissions(db: AsyncSession, offset: int = 0, limit: int = 100) -> list[PermissionRead]:
    perms = await PermissionRepository(db).list_all(offset, limit)
    return [PermissionRead.model_validate(p) for p in perms]


async def count_permissions(db: AsyncSession) -> int:
    return await PermissionRepository(db).count_all()


async def update_permission(db: AsyncSession, permission_id: uuid.UUID, data: PermissionUpdate) -> PermissionRead:
    perm = await PermissionRepository(db).get(permission_id)
    if perm is None:
        raise NotFoundError("Permission not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(perm, field, value)
    perm = await PermissionRepository(db).save(perm)
    await db.commit()
    return PermissionRead.model_validate(perm)


async def delete_permission(db: AsyncSession, permission_id: uuid.UUID) -> None:
    perm = await PermissionRepository(db).get(permission_id)
    if perm is None:
        raise NotFoundError("Permission not found")
    await PermissionRepository(db).delete(perm)
    await db.commit()


async def assign_perm_to_role(db: AsyncSession, role_id: uuid.UUID, permission_ids: list[uuid.UUID]) -> None:
    for pid in permission_ids:
        await get_permission(db, pid)
    await PermissionRepository(db).assign_permissions_to_role(role_id, permission_ids)
    await db.commit()


async def get_role_permissions(db: AsyncSession, role_id: uuid.UUID) -> list[PermissionRead]:
    perms = await PermissionRepository(db).get_permissions_for_role(role_id)
    return [PermissionRead.model_validate(p) for p in perms]


async def get_user_permissions(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> list[PermissionRead]:
    perms = await PermissionRepository(db).get_permissions_for_user(tenant_id, role_id)
    return [PermissionRead.model_validate(p) for p in perms]
