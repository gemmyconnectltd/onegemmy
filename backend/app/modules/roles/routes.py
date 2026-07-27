import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.response import paginated_response, success_response
from app.modules.roles import service
from app.modules.roles.schemas import RoleCreate, RoleRead, RoleUpdate

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("")
async def list_roles(db: DbSession, current_user: CurrentUser):
    from app.core.pagination import PageParams
    params = PageParams()
    roles = await service.list_for_tenant(db, current_user.tenant_id, params.offset, params.limit)
    total = await service.count_for_tenant(db, current_user.tenant_id)
    return paginated_response(
        items=[RoleRead.model_validate(r).model_dump() for r in roles],
        total=total,
        page=params.page,
        page_size=params.page_size,
        message="Roles retrieved successfully",
    )


@router.get("/{role_id}")
async def get_role(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    role = await service.get_by_id(db, current_user.tenant_id, role_id)
    return success_response(
        data=RoleRead.model_validate(role).model_dump(),
        message="Role retrieved successfully",
    )


@router.post("")
async def create_role(data: RoleCreate, db: DbSession, current_user: CurrentUser):
    role = await service.create(db, current_user.tenant_id, data)
    return success_response(
        data=RoleRead.model_validate(role).model_dump(),
        message="Role created successfully",
        status_code=201,
    )


@router.patch("/{role_id}")
async def update_role(
    role_id: uuid.UUID, data: RoleUpdate, db: DbSession, current_user: CurrentUser
):
    role = await service.get_by_id(db, current_user.tenant_id, role_id)
    role = await service.update(db, role, data)
    return success_response(
        data=RoleRead.model_validate(role).model_dump(),
        message="Role updated successfully",
    )


@router.delete("/{role_id}")
async def delete_role(role_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    role = await service.get_by_id(db, current_user.tenant_id, role_id)
    await service.delete(db, role)
    return success_response(message="Role deleted successfully")
