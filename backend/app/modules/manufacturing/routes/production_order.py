import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.manufacturing import service
from app.modules.manufacturing.schemas import ProductionOrderCreate, ProductionOrderUpdate

router = APIRouter(tags=["Manufacturing - Production Orders"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/manufacturing/orders")
async def list_production_orders(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    _require_tenant(current_user.tenant_id)
    items = await service.list_production_orders(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_production_orders(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Production orders retrieved successfully")


@router.post("/manufacturing/orders")
async def create_production_order(data: ProductionOrderCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_production_order(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Production order created successfully", status_code=201)


@router.get("/manufacturing/orders/{id}")
async def get_production_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_production_order(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Production order retrieved successfully")


@router.patch("/manufacturing/orders/{id}")
async def update_production_order(id: uuid.UUID, data: ProductionOrderUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_production_order(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Production order updated successfully")


@router.post("/manufacturing/orders/{id}/complete")
async def complete_production_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.complete_production_order(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Production order completed and stock updated", status_code=200)


@router.delete("/manufacturing/orders/{id}")
async def delete_production_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_production_order(db, current_user.tenant_id, id)
    return success_response(message="Production order deleted successfully")
