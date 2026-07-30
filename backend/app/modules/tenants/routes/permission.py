import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
<<<<<<< HEAD
from app.core.response import paginated_response
from app.core.response import success_response
=======
from app.core.response import paginated_response, success_response
>>>>>>> feature/full-crud-rbac
from app.modules.tenants import service
from app.modules.tenants.schemas import PermissionCreate, PermissionUpdate

router = APIRouter(tags=["Permissions"])


@router.get("/permissions")
async def list_permissions(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    perms = await service.list_permissions(db, page_params.offset, page_params.limit)
    total = await service.count_permissions(db)
    return paginated_response(
        items=[p.model_dump() for p in perms],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Permissions retrieved successfully",
    )


@router.post("/permissions")
async def create_permission(data: PermissionCreate, db: DbSession, current_user: CurrentUser):
    perm = await service.create_permission(db, data)
    return success_response(
        data=perm.model_dump(),
        message="Permission created successfully",
        status_code=201,
    )


@router.get("/permissions/{permission_id}")
async def get_permission(permission_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    perm = await service.get_permission(db, permission_id)
    return success_response(
        data=perm.model_dump(),
        message="Permission retrieved successfully",
    )


@router.patch("/permissions/{permission_id}")
async def update_permission(
    permission_id: uuid.UUID, data: PermissionUpdate, db: DbSession, current_user: CurrentUser
):
    perm = await service.update_permission(db, permission_id, data)
    return success_response(
        data=perm.model_dump(),
        message="Permission updated successfully",
    )


@router.delete("/permissions/{permission_id}")
async def delete_permission(permission_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_permission(db, permission_id)
    return success_response(message="Permission deleted successfully")
