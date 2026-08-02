import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.hr import service
from app.modules.hr.schemas import AttendanceCreate, AttendanceUpdate

router = APIRouter(tags=["HR - Attendance"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/hr/attendance")
async def list_attendance(db: DbSession, current_user: CurrentUser, page_params: PageQuery, employee_id: uuid.UUID | None = Query(None), status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_attendance(db, current_user.tenant_id, employee_id, status, page_params.offset, page_params.limit)
    total = await service.count_attendance(db, current_user.tenant_id, employee_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Attendance retrieved")


@router.post("/hr/attendance")
async def create_attendance(data: AttendanceCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_attendance(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Attendance created", status_code=201)


@router.get("/hr/attendance/{id}")
async def get_attendance(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_attendance(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Attendance retrieved")


@router.patch("/hr/attendance/{id}")
async def update_attendance(id: uuid.UUID, data: AttendanceUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_attendance(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Attendance updated")


@router.delete("/hr/attendance/{id}")
async def delete_attendance(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_attendance(db, current_user.tenant_id, id)
    return success_response(message="Attendance deleted")
