import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.repairs import service
from app.modules.repairs.schemas import RepairJobCreate, RepairJobUpdate

router = APIRouter(tags=["Repairs"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/repairs")
async def list_jobs(db: DbSession, current_user: CurrentUser, page_params: PageQuery, status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_jobs(db, current_user.tenant_id, status, page_params.offset, page_params.limit)
    total = await service.count_jobs(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Repair jobs retrieved successfully")


@router.post("/repairs")
async def create_job(data: RepairJobCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_job(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Repair job created", status_code=201)


@router.get("/repairs/{id}")
async def get_job(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_job(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Repair job retrieved")


@router.patch("/repairs/{id}")
async def update_job(id: uuid.UUID, data: RepairJobUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_job(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Repair job updated")


@router.delete("/repairs/{id}")
async def delete_job(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_job(db, current_user.tenant_id, id)
    return success_response(message="Repair job deleted")
