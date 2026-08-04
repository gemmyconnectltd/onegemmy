import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.procurement import service
from app.modules.procurement.schemas import PurchaseCreate, PurchaseUpdate

router = APIRouter(tags=["Procurement - Purchase Orders"])


@router.get("/procurement/purchase-orders")
async def list_purchase_orders(db: DbSession, current_user: CurrentUser, page_params: PageQuery, status: str | None = None):
    items = await service.list_purchases(db, current_user.tenant_id, status, page_params.offset, page_params.limit)
    total = await service.count_purchases(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Purchase orders retrieved successfully")


@router.post("/procurement/purchase-orders")
async def create_purchase_order(data: PurchaseCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_purchase(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Purchase order created successfully", status_code=201)


@router.get("/procurement/purchase-orders/{id}")
async def get_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_purchase(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Purchase order retrieved successfully")


@router.patch("/procurement/purchase-orders/{id}")
async def update_purchase_order(id: uuid.UUID, data: PurchaseUpdate, db: DbSession, current_user: CurrentUser):
    obj = await service.update_purchase(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Purchase order updated successfully")


@router.post("/procurement/purchase-orders/{id}/receive")
async def receive_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.receive_purchase(db, current_user.tenant_id, id, current_user.id)
    return success_response(data=obj.model_dump(), message="Purchase order received and stock updated")


@router.post("/procurement/purchase-orders/{id}/cancel")
async def cancel_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.cancel_purchase(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Purchase order cancelled")


@router.delete("/procurement/purchase-orders/{id}")
async def delete_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_purchase(db, current_user.tenant_id, id)
    return success_response(message="Purchase order deleted successfully")
