import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas import DealCreate, DealUpdate

router = APIRouter(tags=["Sales - Deals"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/deals")
async def list_deals(db: DbSession, current_user: CurrentUser, page_params: PageQuery, stage: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_deals(db, current_user.tenant_id, stage, page_params.offset, page_params.limit)
    total = await service.count_deals(db, current_user.tenant_id, stage)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Deals retrieved successfully")


@router.post("/sales/deals")
async def create_deal(data: DealCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_deal(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Deal created successfully", status_code=201)


@router.get("/sales/deals/{id}")
async def get_deal(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_deal(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Deal retrieved successfully")


@router.patch("/sales/deals/{id}")
async def update_deal(id: uuid.UUID, data: DealUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_deal(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Deal updated successfully")


@router.delete("/sales/deals/{id}")
async def delete_deal(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_deal(db, current_user.tenant_id, id)
    return success_response(message="Deal deleted successfully")
