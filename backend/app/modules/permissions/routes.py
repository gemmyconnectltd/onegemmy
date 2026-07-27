import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import paginated_response, success_response
from app.modules.permissions import service
from app.modules.permissions.schemas import (
    PermissionCreate,
    PermissionRead,
    PermissionUpdate,
    RolePermissionAssign,
)

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("")
async def list_permissions(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    perms = await service.list_all(db, params.offset, params.limit)
    total = await service.count_all(db)
    return paginated_response(
        items=[PermissionRead.model_validate(p).model_dump() for p in perms],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Permissions retrieved successfully",
    )


@router.post("")
async def create_permission(data: PermissionCreate, db: DbSession, current_user: CurrentUser):
    perm = await service.create(db, data)
    return success_response(
        data=PermissionRead.model_validate(perm).model_dump(),
        message="Permission created successfully",
        status_code=201,
    )


@router.get("/user/me")
async def get_my_permissions(db: DbSession, current_user: CurrentUser):
    if current_user.role_id is None:
        return success_response(data=[], message="No role assigned")
    perms = await service.get_for_user(db, current_user.tenant_id, current_user.role_id)
    return success_response(
        data=[PermissionRead.model_validate(p).model_dump() for p in perms],
        message="User permissions retrieved successfully",
    )


@router.get("/role/{role_id}")
async def get_role_permissions(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    perms = await service.get_for_role(db, role_id)
    return success_response(
        data=[PermissionRead.model_validate(p).model_dump() for p in perms],
        message="Role permissions retrieved successfully",
    )


@router.post("/role/{role_id}")
async def assign_role_permissions(
    role_id: uuid.UUID, data: RolePermissionAssign, db: DbSession, current_user: CurrentUser
):
    await service.assign_to_role(db, role_id, data.permission_ids)
    return success_response(message="Permissions assigned to role successfully")


@router.get("/{permission_id}")
async def get_permission(permission_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    perm = await service.get_by_id(db, permission_id)
    return success_response(
        data=PermissionRead.model_validate(perm).model_dump(),
        message="Permission retrieved successfully",
    )


@router.patch("/{permission_id}")
async def update_permission(
    permission_id: uuid.UUID, data: PermissionUpdate, db: DbSession, current_user: CurrentUser
):
    perm = await service.get_by_id(db, permission_id)
    perm = await service.update(db, perm, data)
    return success_response(
        data=PermissionRead.model_validate(perm).model_dump(),
        message="Permission updated successfully",
    )


@router.delete("/{permission_id}")
async def delete_permission(permission_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    perm = await service.get_by_id(db, permission_id)
    await service.delete(db, perm)
    return success_response(message="Permission deleted successfully")
