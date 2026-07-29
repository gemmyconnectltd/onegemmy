import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import paginated_response, success_response
from app.modules.auth import service
from app.modules.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    PermissionCreate,
    PermissionRead,
    PermissionUpdate,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    RoleCreate,
    RolePermissionAssign,
    RoleRead,
    RoleUpdate,
)
from app.modules.users.schemas import ChangePasswordRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/roles")
async def list_roles(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    roles = await service.list_roles(db, current_user.tenant_id, params.offset, params.limit)
    total = await service.count_roles(db, current_user.tenant_id)
    return paginated_response(
        items=[RoleRead.model_validate(r).model_dump() for r in roles],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Roles retrieved successfully",
    )


@router.post("/roles")
async def create_role(data: RoleCreate, db: DbSession, current_user: CurrentUser):
    role = await service.create_role(db, current_user.tenant_id, data)
    return success_response(
        data=RoleRead.model_validate(role).model_dump(),
        message="Role created successfully",
        status_code=201,
    )


@router.get("/roles/{role_id}")
async def get_role(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    role = await service.get_role(db, current_user.tenant_id, role_id)
    return success_response(
        data=RoleRead.model_validate(role).model_dump(),
        message="Role retrieved successfully",
    )


@router.patch("/roles/{role_id}")
async def update_role(role_id: uuid.UUID, data: RoleUpdate, db: DbSession, current_user: CurrentUser):
    role = await service.get_role(db, current_user.tenant_id, role_id)
    role = await service.update_role(db, role, data)
    return success_response(
        data=RoleRead.model_validate(role).model_dump(),
        message="Role updated successfully",
    )


@router.delete("/roles/{role_id}")
async def delete_role(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    role = await service.get_role(db, current_user.tenant_id, role_id)
    await service.delete_role(db, role)
    return success_response(message="Role deleted successfully")


@router.get("/permissions")
async def list_permissions(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    perms = await service.list_permissions(db, params.offset, params.limit)
    total = await service.count_permissions(db)
    return paginated_response(
        items=[PermissionRead.model_validate(p).model_dump() for p in perms],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Permissions retrieved successfully",
    )


@router.post("/permissions")
async def create_permission(data: PermissionCreate, db: DbSession, current_user: CurrentUser):
    perm = await service.create_permission(db, data)
    return success_response(
        data=PermissionRead.model_validate(perm).model_dump(),
        message="Permission created successfully",
        status_code=201,
    )


@router.get("/permissions/user/me")
async def get_my_permissions(db: DbSession, current_user: CurrentUser):
    if current_user.role_id is None:
        return success_response(data=[], message="No role assigned")
    perms = await service.get_user_permissions(db, current_user.tenant_id, current_user.role_id)
    return success_response(
        data=[PermissionRead.model_validate(p).model_dump() for p in perms],
        message="User permissions retrieved successfully",
    )


@router.get("/permissions/role/{role_id}")
async def get_role_permissions(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    perms = await service.get_role_permissions(db, role_id)
    return success_response(
        data=[PermissionRead.model_validate(p).model_dump() for p in perms],
        message="Role permissions retrieved successfully",
    )


@router.post("/permissions/role/{role_id}")
async def assign_role_permissions(
    role_id: uuid.UUID, data: RolePermissionAssign, db: DbSession, current_user: CurrentUser
):
    await service.assign_perm_to_role(db, role_id, data.permission_ids)
    return success_response(message="Permissions assigned to role successfully")


@router.get("/permissions/{permission_id}")
async def get_permission(permission_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    perm = await service.get_permission(db, permission_id)
    return success_response(
        data=PermissionRead.model_validate(perm).model_dump(),
        message="Permission retrieved successfully",
    )


@router.patch("/permissions/{permission_id}")
async def update_permission(
    permission_id: uuid.UUID, data: PermissionUpdate, db: DbSession, current_user: CurrentUser
):
    perm = await service.get_permission(db, permission_id)
    perm = await service.update_permission(db, perm, data)
    return success_response(
        data=PermissionRead.model_validate(perm).model_dump(),
        message="Permission updated successfully",
    )


@router.delete("/permissions/{permission_id}")
async def delete_permission(permission_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    perm = await service.get_permission(db, permission_id)
    await service.delete_permission(db, perm)
    return success_response(message="Permission deleted successfully")


@router.post("/register")
async def register(data: RegisterRequest, db: DbSession):
    result = await service.register(db, data)
    return success_response(
        data=result.model_dump(),
        message="Registration successful",
        status_code=201,
    )


@router.post("/login")
async def login(data: LoginRequest, db: DbSession):
    result = await service.login(db, data)
    return success_response(
        data=result.model_dump(),
        message="Login successful",
    )


@router.post("/refresh")
async def refresh(data: RefreshRequest, db: DbSession):
    result = await service.refresh(db, data.refresh_token)
    return success_response(
        data=result.model_dump(),
        message="Token refreshed successfully",
    )


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, db: DbSession):
    result = await service.forgot_password(db, data)
    return success_response(
        data=result,
        message="If the email exists, a password reset link has been sent",
    )


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: DbSession):
    await service.reset_password(db, data)
    return success_response(message="Password reset successful")


@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, db: DbSession, current_user: CurrentUser):
    await service.change_password(db, current_user, data)
    return success_response(message="Password changed successfully")
