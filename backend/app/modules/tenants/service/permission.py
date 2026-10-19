import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.modules.tenants.models import Permission, User
from app.modules.tenants.repository import PermissionRepository, RoleRepository
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


async def assign_perm_to_role(db: AsyncSession, role_id: uuid.UUID, permission_ids: list[uuid.UUID], actor: User | None = None) -> None:
    ids = list(dict.fromkeys(permission_ids))
    permissions = await PermissionRepository(db).get_by_ids(ids)
    if len(permissions) != len(ids):
        raise NotFoundError("One or more permissions no longer exist; reload the permission catalog")
    if actor is not None:
        role = await RoleRepository(db).get_by_id_for_tenant(actor.tenant_id, role_id)
        if role is None:
            raise NotFoundError("Role not found")
        if not actor.is_superuser and {permission.name for permission in permissions} - set(actor.permissions_names):
            raise ForbiddenError("You cannot grant permissions that your own account does not hold; ask an owner")
    await PermissionRepository(db).assign_permissions_to_role(role_id, ids)
    if actor is not None:
        from app.modules.audit.service import record_audit
        await record_audit(db, tenant_id=actor.tenant_id, actor_user_id=actor.id,
            actor_name=actor.full_name, action="role.permissions_updated", entity_type="role",
            entity_id=str(role_id), summary="Role permissions updated",
            changes={"permissions": sorted(permission.name for permission in permissions)})
    await db.commit()


async def get_role_permissions(db: AsyncSession, role_id: uuid.UUID) -> list[PermissionRead]:
    perms = await PermissionRepository(db).get_permissions_for_role(role_id)
    return [PermissionRead.model_validate(p) for p in perms]


async def get_user_permissions(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> list[PermissionRead]:
    perms = await PermissionRepository(db).get_permissions_for_user(tenant_id, role_id)
    return [PermissionRead.model_validate(p) for p in perms]
