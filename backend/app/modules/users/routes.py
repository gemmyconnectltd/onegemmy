import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import paginated_response, success_response
from app.modules.users import service
from app.modules.users.schemas import ChangePasswordRequest, UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


def _user_to_dict(user) -> dict:
    data = UserRead.model_validate(user).model_dump()
    data["permissions"] = user.permissions_names
    return data


@router.get("/me")
async def read_current_user(current_user: CurrentUser):
    return success_response(
        data=_user_to_dict(current_user),
        message="Current user retrieved successfully",
    )


@router.get("")
async def list_users(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    users = await service.list_for_tenant(db, current_user.tenant_id, params.offset, params.limit)
    total = await service.count_for_tenant(db, current_user.tenant_id)
    return paginated_response(
        items=[_user_to_dict(u) for u in users],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Users retrieved successfully",
    )


@router.get("/{user_id}")
async def read_user(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    user = await service.get_by_id(db, current_user.tenant_id, user_id)
    return success_response(
        data=_user_to_dict(user),
        message="User retrieved successfully",
    )


@router.post("")
async def create_user(data: UserCreate, db: DbSession, current_user: CurrentUser):
    user = await service.create(db, current_user.tenant_id, data)
    return success_response(
        data=_user_to_dict(user),
        message="User created successfully",
        status_code=201,
    )


@router.patch("/{user_id}")
async def update_user(
    user_id: uuid.UUID, data: UserUpdate, db: DbSession, current_user: CurrentUser
):
    user = await service.get_by_id(db, current_user.tenant_id, user_id)
    user = await service.update_user(db, user, data)
    return success_response(
        data=_user_to_dict(user),
        message="User updated successfully",
    )


@router.delete("/{user_id}")
async def delete_user(user_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    user = await service.get_by_id(db, current_user.tenant_id, user_id)
    await service.delete(db, user)
    return success_response(message="User deleted successfully")


@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, db: DbSession, current_user: CurrentUser):
    await service.change_password(db, current_user, data)
    return success_response(message="Password changed successfully")
