import uuid

from fastapi import APIRouter, Depends, Query

from app.core.deps import CurrentUser, DbSession, require_permission
from app.core.exceptions import ForbiddenError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import (
    AdminResetPasswordRequest,
    ChangePasswordRequest,
    MyProfileUpdate,
    UserCreate,
    UserUpdate,
)

router = APIRouter(tags=["Users"])


def _require_tenant(tenant_id: uuid.UUID | None) -> uuid.UUID:
    """Platform superusers have no tenant of their own. Without this, a
    tenant-scoped route would query with tenant_id=None and match every
    unowned row on the platform."""
    if tenant_id is None:
        raise ForbiddenError("This action requires a company account")
    return tenant_id


@router.get("/users/me")
async def read_current_user(current_user: CurrentUser):
    data = service.user_to_read(current_user)
    return success_response(
        data=data.model_dump(),
        message="Current user retrieved successfully",
    )


@router.get("/users/me/permissions")
async def get_my_permissions(db: DbSession, current_user: CurrentUser):
    if current_user.role_id is None:
        return success_response(data=[], message="No role assigned")
    perms = await service.get_user_permissions(db, current_user.tenant_id, current_user.role_id)
    return success_response(
        data=[p.model_dump() for p in perms],
        message="User permissions retrieved successfully",
    )


@router.patch("/users/me")
async def update_my_profile(
    data: MyProfileUpdate, db: DbSession, current_user: CurrentUser
):
    """Self-service. Ungated so any signed-in user can fix their own name and
    phone; MyProfileUpdate keeps role/status/email off-limits. Declared before
    the `/{user_id}` routes so the literal path can't be shadowed."""
    user = await service.update_my_profile(db, current_user, data)
    return success_response(
        data=user.model_dump(),
        message="Profile updated successfully",
    )


@router.post("/users/change-password")
async def change_password(data: ChangePasswordRequest, db: DbSession, current_user: CurrentUser):
    """Self-service. Deliberately ungated by `users:update` — every user
    must be able to change their own password. Declared before the
    `/{user_id}` routes so the literal path can never be shadowed by a path
    parameter."""
    await service.change_password(db, current_user, data)
    return success_response(message="Password changed successfully")


@router.get("/users", dependencies=[Depends(require_permission("users:read"))])
async def list_users(
    db: DbSession,
    current_user: CurrentUser,
    page_params: PageQuery,
    search: str | None = Query(default=None, max_length=120),
    is_active: bool | None = Query(default=None),
    role_id: uuid.UUID | None = Query(default=None),
):
    tenant_id = _require_tenant(current_user.tenant_id)
    users = await service.list_users(
        db,
        tenant_id,
        page_params.offset,
        page_params.limit,
        search=search,
        is_active=is_active,
        role_id=role_id,
    )
    total = await service.count_users(db, tenant_id, search=search, is_active=is_active, role_id=role_id)
    return paginated_response(
        items=[u.model_dump() for u in users],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Users retrieved successfully",
    )


@router.get("/users/{user_id}", dependencies=[Depends(require_permission("users:read"))])
async def read_user(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    tenant_id = _require_tenant(current_user.tenant_id)
    user = await service.get_user_by_id(db, tenant_id, user_id)
    return success_response(
        data=user.model_dump(),
        message="User retrieved successfully",
    )


@router.get("/users/{user_id}/activity", dependencies=[Depends(require_permission("users:read"))])
async def read_user_activity(
    user_id: uuid.UUID, db: DbSession, current_user: CurrentUser, page_params: PageQuery
):
    """Audit trail for one user: the actions they performed plus every admin
    action taken against their account."""
    tenant_id = _require_tenant(current_user.tenant_id)
    items, total = await service.get_user_activity(
        db, tenant_id, user_id, page_params.offset, page_params.limit
    )
    return paginated_response(
        items=[i.model_dump() for i in items],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="User activity retrieved successfully",
    )


@router.post("/users", status_code=201, dependencies=[Depends(require_permission("users:create"))])
async def create_user(data: UserCreate, db: DbSession, current_user: CurrentUser):
    tenant_id = _require_tenant(current_user.tenant_id)
    user = await service.create_user(db, tenant_id, data, actor=current_user)
    return success_response(
        data=user.model_dump(),
        message="User created successfully",
        status_code=201,
    )


@router.patch("/users/{user_id}", dependencies=[Depends(require_permission("users:update"))])
async def update_user(
    user_id: uuid.UUID, data: UserUpdate, db: DbSession, current_user: CurrentUser
):
    tenant_id = _require_tenant(current_user.tenant_id)
    user = await service.update_user(db, tenant_id, user_id, data, actor=current_user)
    return success_response(
        data=user.model_dump(),
        message="User updated successfully",
    )


@router.post("/users/{user_id}/activate", dependencies=[Depends(require_permission("users:update"))])
async def activate_user(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    tenant_id = _require_tenant(current_user.tenant_id)
    user = await service.set_user_active(db, tenant_id, user_id, True, actor=current_user)
    return success_response(
        data=user.model_dump(),
        message="User activated successfully",
    )


@router.post("/users/{user_id}/deactivate", dependencies=[Depends(require_permission("users:update"))])
async def deactivate_user(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    tenant_id = _require_tenant(current_user.tenant_id)
    user = await service.set_user_active(db, tenant_id, user_id, False, actor=current_user)
    return success_response(
        data=user.model_dump(),
        message="User deactivated successfully",
    )


@router.delete("/users/{user_id}", dependencies=[Depends(require_permission("users:delete"))])
async def delete_user(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    tenant_id = _require_tenant(current_user.tenant_id)
    await service.delete_user(db, tenant_id, user_id, actor=current_user)
    return success_response(message="User deleted successfully")


@router.post(
    "/users/{user_id}/reset-password",
    dependencies=[Depends(require_permission("users:update"))],
)
async def admin_reset_user_password(
    user_id: uuid.UUID,
    data: AdminResetPasswordRequest,
    db: DbSession,
    current_user: CurrentUser,
):
    """Generates a new password server-side and emails it to the user. The
    value is never returned to the caller."""
    tenant_id = _require_tenant(current_user.tenant_id)
    result = await service.admin_reset_password(
        db, tenant_id, user_id, current_user, send_email=data.send_email
    )
    return success_response(
        data=result,
        message=(
            "Password reset — a temporary password was emailed to the user"
            if data.send_email
            else "Password reset — the user must use 'Forgot password' to set a new one"
        ),
    )
