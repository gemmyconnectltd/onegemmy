import uuid

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbSession, require_permission
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import RoleCreate, RolePermissionAssign, RoleUpdate


async def authorize_role(request: Request, current_user: CurrentUser):
    action = "read" if request.method == "GET" else "update"
    await require_permission(f"roles:{action}")(current_user)


router = APIRouter(tags=["Roles"], dependencies=[Depends(authorize_role)])


@router.get("/roles")
async def list_roles(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    roles = await service.list_roles(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_roles(db, current_user.tenant_id)
    return paginated_response(
        items=[r.model_dump() for r in roles],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Roles retrieved successfully",
    )


@router.get("/roles/review")
async def review_roles(db: DbSession, current_user: CurrentUser):
    """Roles that can delete or approve, and how many people hold each, so an owner can decide whether to tighten them."""
    return success_response(data=await service.review_roles(db, current_user.tenant_id), message="Role review retrieved")


@router.post("/roles/{role_id}/tighten")
async def tighten_role(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    """Owner-initiated: remove delete and approve from the built-in Member role. Never runs automatically."""
    removed = await service.tighten_member_role(db, current_user.tenant_id, role_id)
    from app.modules.audit.service import record_audit

    await record_audit(db, tenant_id=current_user.tenant_id, actor_user_id=current_user.id, actor_name=current_user.full_name, action="role.tightened",
                       entity_type="role", entity_id=str(role_id), summary="Removed delete and approve permissions from Member", changes={"removed": removed})
    await db.commit()
    return success_response(data={"removed": removed}, message="Member role tightened")


@router.post("/roles/seed-defaults")
async def seed_default_roles_route(db: DbSession, current_user: CurrentUser):
    """Adds the built-in roles this business doesn't have yet (Branch Manager, Cashier ...). Roles it already has are left exactly as they are."""
    from app.modules.audit.service import record_audit
    from app.modules.tenants.repository import RoleRepository

    before = {r.name for r in await RoleRepository(db).template_roles(current_user.tenant_id)}
    await service.seed_default_roles(db, current_user.tenant_id)
    after = {r.name for r in await RoleRepository(db).template_roles(current_user.tenant_id)}
    added = sorted(after - before)
    if added:
        await record_audit(db, tenant_id=current_user.tenant_id, actor_user_id=current_user.id, actor_name=current_user.full_name, action="role.defaults_added",
                           entity_type="role", summary=f"Added built-in roles: {', '.join(added)}", changes={"added": added})
    await db.commit()
    return success_response(data={"added": added}, message="Built-in roles added" if added else "Your business already has every built-in role")


@router.post("/roles")
async def create_role(data: RoleCreate, db: DbSession, current_user: CurrentUser):
    role = await service.create_role(db, current_user.tenant_id, data)
    return success_response(
        data=role.model_dump(),
        message="Role created successfully",
        status_code=201,
    )


@router.get("/roles/{role_id}")
async def get_role(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    role = await service.get_role(db, current_user.tenant_id, role_id)
    return success_response(
        data=role.model_dump(),
        message="Role retrieved successfully",
    )


@router.patch("/roles/{role_id}")
async def update_role(role_id: uuid.UUID, data: RoleUpdate, db: DbSession, current_user: CurrentUser):
    role = await service.update_role(db, current_user.tenant_id, role_id, data)
    return success_response(
        data=role.model_dump(),
        message="Role updated successfully",
    )


@router.delete("/roles/{role_id}")
async def delete_role(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_role(db, current_user.tenant_id, role_id)
    return success_response(message="Role deleted successfully")


@router.get("/roles/{role_id}/permissions")
async def get_role_permissions(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    # Ensure the role belongs to this tenant before returning its permissions.
    await service.get_role(db, current_user.tenant_id, role_id)
    perms = await service.get_role_permissions(db, role_id)
    return success_response(
        data=[p.model_dump() for p in perms],
        message="Role permissions retrieved successfully",
    )


@router.post("/roles/{role_id}/permissions")
async def assign_role_permissions(
    role_id: uuid.UUID, data: RolePermissionAssign, db: DbSession, current_user: CurrentUser
):
    # Only the owning tenant may edit a role's permissions.
    await service.get_role(db, current_user.tenant_id, role_id)
    await service.assign_perm_to_role(db, role_id, data.permission_ids, current_user)
    return success_response(message="Permissions assigned to role successfully")
