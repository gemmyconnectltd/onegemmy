"""Platform management of employee feature switches within a selected business."""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import MODULE_RESOURCES
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.billing.repository import BillingRepository
from app.modules.tenants.models import User
from app.modules.tenants.repository import UserRepository
from app.modules.tenants.schemas import UserUpdate
from app.modules.tenants.service.access import user_access
from app.modules.tenants.service.user import update_user


async def employee_access(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found in this business")
    return await user_access(db, tenant_id, user)


async def set_employee_feature(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID,
    module: str, enabled: bool, actor: User,
) -> dict:
    if module not in MODULE_RESOURCES:
        raise ValidationError("Unknown feature")
    # Serialize switches with the owner management path; preserve other modules.
    await BillingRepository(db).tenant(tenant_id, lock=True)
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found in this business")
    disabled = set(user.disabled_modules or [])
    if enabled:
        disabled.discard(module)
    else:
        disabled.add(module)
    await update_user(
        db, tenant_id, user_id, UserUpdate(disabled_modules=sorted(disabled)), actor=actor,
    )
    return await employee_access(db, tenant_id, user_id)


async def employee_details(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID):
    from app.modules.tenants.service.user import get_user_by_id

    return await get_user_by_id(db, tenant_id, user_id)


async def validate_department(db: AsyncSession, tenant_id: uuid.UUID, department_id) -> None:
    from app.modules.tenants.repository import DepartmentRepository

    if department_id and await DepartmentRepository(db).get_by_id_for_tenant(tenant_id, department_id) is None:
        raise NotFoundError("Department not found in this business")


async def edit_employee(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: UserUpdate, actor: User):
    await validate_department(db, tenant_id, data.department_id)
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found in this business")
    if user.is_superuser and {"role", "role_id"} & data.model_fields_set:
        raise ValidationError("The business owner's role cannot be changed here")
    # Status has a separate audited endpoint with owner/last-admin safeguards.
    if "is_active" in data.model_fields_set:
        raise ValidationError("Use the account status action to activate or deactivate this user")
    return await update_user(db, tenant_id, user_id, data, actor=actor)


async def invite_employee(db: AsyncSession, tenant_id: uuid.UUID, data, actor: User):
    from app.modules.tenants.service.user import create_user

    await validate_department(db, tenant_id, data.department_id)
    return await create_user(db, tenant_id, data, actor=actor)


async def employee_permissions(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    from app.core.permission_policy import CHECKOUT_CREATION, OPERATIONAL_VIEW_EDIT
    from app.modules.admin.repository import role_holder_count
    from app.modules.tenants.repository import RoleRepository
    from app.modules.tenants.service.access import matrix, permission_catalog, role_access

    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found in this business")
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, user.role_id) if user.role_id else None
    if role:
        groups = (await role_access(db, tenant_id, role))["groups"]
    else:
        view = await employee_access(db, tenant_id, user_id)
        groups = matrix(await permission_catalog(db), set(), False,
                        {m["key"]: m["status"] for m in view["modules"]}, {})
    return {
        "role_id": str(role.id) if role else None, "role_name": role.name if role else None,
        "role_users": await role_holder_count(db, tenant_id, role.id) if role else 0,
        "is_owner": user.is_superuser, "groups": groups,
        "permission_ids": [str(p.id) for p in role.permissions] if role else [],
        "baseline": sorted(OPERATIONAL_VIEW_EDIT | CHECKOUT_CREATION),
    }


async def save_employee_permissions(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, permission_ids: list[uuid.UUID],
    expected_role_id: uuid.UUID | None, expected_permission_ids: list[uuid.UUID],
    scope: str, actor: User,
) -> dict:
    from app.core.exceptions import ConflictError
    from app.modules.admin.repository import role_holder_count
    from app.modules.audit.service import record_audit
    from app.modules.tenants.models import Role
    from app.modules.tenants.repository import PermissionRepository, RoleRepository
    from app.modules.tenants.service.permission import assign_perm_to_role

    await BillingRepository(db).tenant(tenant_id, lock=True)
    user = await UserRepository(db).get_by_id_for_tenant(tenant_id, user_id)
    if user is None:
        raise NotFoundError("User not found in this business")
    if user.is_superuser:
        raise ValidationError("The business owner retains full access")
    if user.role_id != expected_role_id:
        raise ConflictError("This user's role changed. Reload before saving permissions")
    old_role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, user.role_id) if user.role_id else None
    assigned = {p.id for p in old_role.permissions} if old_role else set()
    if assigned != set(expected_permission_ids):
        raise ConflictError("These permissions changed. Reload before saving")
    permissions = await PermissionRepository(db).get_by_ids(list(set(permission_ids)))
    if len(permissions) != len(set(permission_ids)):
        raise NotFoundError("One or more permissions no longer exist")
    if scope == "role":
        if old_role is None:
            raise ValidationError("Assign a role before editing shared role permissions")
        if old_role.name.lower() in {"admin", "owner"}:
            raise ValidationError("Use user-only permissions for an administrator; the Admin role retains full access")
        await assign_perm_to_role(db, old_role.id, permission_ids, actor, target_tenant_id=tenant_id)
    else:
        marker = f"Personal access for user {user.id}"
        personal = old_role and old_role.description == marker and await role_holder_count(db, tenant_id, old_role.id) == 1
        role = old_role if personal else Role(
            tenant_id=tenant_id, name=f"{user.full_name[:25]} access {uuid.uuid4().hex[:8]}",
            description=marker, permissions=[],
        )
        role.permissions = permissions
        role = await RoleRepository(db).save(role)
        await record_audit(db, tenant_id=tenant_id, actor_user_id=actor.id, actor_name=actor.full_name,
                           action="user.permissions_updated", entity_type="user", entity_id=str(user.id),
                           summary="Individual permissions updated using a dedicated role",
                           changes={"previous_role_id": str(user.role_id) if user.role_id else None,
                                    "role_id": str(role.id), "permissions": sorted(p.name for p in permissions)})
        await update_user(db, tenant_id, user_id, UserUpdate(role_id=role.id), actor=actor)
    if old_role:
        await db.refresh(old_role, ["permissions"])
    return await employee_permissions(db, tenant_id, user_id)


async def team_role_permissions(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> dict:
    from app.core.permission_policy import CHECKOUT_CREATION, OPERATIONAL_VIEW_EDIT
    from app.modules.tenants.repository import RoleRepository
    from app.modules.tenants.service.access import role_access

    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found in this business")
    result = await role_access(db, tenant_id, role)
    return {"role_id": str(role.id), "role_name": role.name, "role_users": result["role"]["users"],
            "is_owner": False, "permission_ids": [str(p.id) for p in role.permissions],
            "groups": result["groups"], "baseline": sorted(OPERATIONAL_VIEW_EDIT | CHECKOUT_CREATION)}


async def save_team_role_permissions(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID,
                                     permission_ids: list[uuid.UUID], expected: list[uuid.UUID], actor: User) -> dict:
    from app.core.exceptions import ConflictError
    from app.modules.tenants.repository import RoleRepository
    from app.modules.tenants.service.permission import assign_perm_to_role

    await BillingRepository(db).tenant(tenant_id, lock=True)
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found in this business")
    if role.name.lower() in {"admin", "owner"}:
        raise ValidationError("The Admin role retains full access. Customize individual users instead")
    if {p.id for p in role.permissions} != set(expected):
        raise ConflictError("Role permissions changed. Reload before saving")
    await assign_perm_to_role(db, role_id, permission_ids, actor, target_tenant_id=tenant_id)
    await db.refresh(role, ["permissions"])
    return await team_role_permissions(db, tenant_id, role_id)
