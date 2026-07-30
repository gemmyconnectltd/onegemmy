import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery, paginated_response
from app.core.response import success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import RoleCreate, RolePermissionAssign, RoleUpdate

router = APIRouter()


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
    perms = await service.get_role_permissions(db, role_id)
    return success_response(
        data=[p.model_dump() for p in perms],
        message="Role permissions retrieved successfully",
    )


@router.post("/roles/{role_id}/permissions")
async def assign_role_permissions(
    role_id: uuid.UUID, data: RolePermissionAssign, db: DbSession, current_user: CurrentUser
):
    await service.assign_perm_to_role(db, role_id, data.permission_ids)
    return success_response(message="Permissions assigned to role successfully")
