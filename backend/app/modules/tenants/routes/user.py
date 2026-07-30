import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery, paginated_response
from app.core.response import success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import ChangePasswordRequest, UserCreate, UserUpdate

router = APIRouter()


@router.get("/users/me")
async def read_current_user(current_user: CurrentUser):
    from app.modules.tenants.schemas import UserRead
    data = UserRead.model_validate(current_user)
    data.permissions = current_user.permissions_names
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


@router.get("/users")
async def list_users(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    users = await service.list_users(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_users(db, current_user.tenant_id)
    return paginated_response(
        items=[u.model_dump() for u in users],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Users retrieved successfully",
    )


@router.get("/users/{user_id}")
async def read_user(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    user = await service.get_user_by_id(db, current_user.tenant_id, user_id)
    return success_response(
        data=user.model_dump(),
        message="User retrieved successfully",
    )


@router.post("/users")
async def create_user(data: UserCreate, db: DbSession, current_user: CurrentUser):
    user = await service.create_user(db, current_user.tenant_id, data)
    return success_response(
        data=user.model_dump(),
        message="User created successfully",
        status_code=201,
    )


@router.patch("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID, data: UserUpdate, db: DbSession, current_user: CurrentUser
):
    user = await service.update_user(db, current_user.tenant_id, user_id, data)
    return success_response(
        data=user.model_dump(),
        message="User updated successfully",
    )


@router.delete("/users/{user_id}")
async def delete_user(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_user(db, current_user.tenant_id, user_id)
    return success_response(message="User deleted successfully")


@router.post("/users/change-password")
async def change_password(data: ChangePasswordRequest, db: DbSession, current_user: CurrentUser):
    await service.change_password(db, current_user, data)
    return success_response(message="Password changed successfully")
