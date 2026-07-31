import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas import TargetCreate, TargetUpdate

router = APIRouter(tags=["Sales - Targets"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/targets")
async def list_targets(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_targets(db, current_user.tenant_id, period, page_params.offset, page_params.limit)
    total = await service.count_targets(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Targets retrieved successfully")


@router.post("/sales/targets")
async def create_target(data: TargetCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_target(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Target created successfully", status_code=201)


@router.get("/sales/targets/{id}")
async def get_target(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_target(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Target retrieved successfully")


@router.patch("/sales/targets/{id}")
async def update_target(id: uuid.UUID, data: TargetUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_target(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Target updated successfully")


@router.delete("/sales/targets/{id}")
async def delete_target(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_target(db, current_user.tenant_id, id)
    return success_response(message="Target deleted successfully")
