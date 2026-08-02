import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.hr import service
from app.modules.hr.schemas import LeaveCreate, LeaveUpdate

router = APIRouter(tags=["HR - Leave"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/hr/leave")
async def list_leave(db: DbSession, current_user: CurrentUser, page_params: PageQuery, status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_leave(db, current_user.tenant_id, status, page_params.offset, page_params.limit)
    total = await service.count_leave(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Leave requests retrieved")


@router.post("/hr/leave")
async def create_leave(data: LeaveCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_leave(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Leave request created", status_code=201)


@router.get("/hr/leave/{id}")
async def get_leave(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_leave(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Leave request retrieved")


@router.patch("/hr/leave/{id}")
async def update_leave(id: uuid.UUID, data: LeaveUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_leave(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Leave request updated")


@router.post("/hr/leave/{id}/approve")
async def approve_leave(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.set_leave_status(db, current_user.tenant_id, id, "Approved", current_user.id)
    return success_response(data=obj.model_dump(), message="Leave request approved")


@router.post("/hr/leave/{id}/reject")
async def reject_leave(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.set_leave_status(db, current_user.tenant_id, id, "Rejected", current_user.id)
    return success_response(data=obj.model_dump(), message="Leave request rejected")


@router.delete("/hr/leave/{id}")
async def delete_leave(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_leave(db, current_user.tenant_id, id)
    return success_response(message="Leave request deleted")
