import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.procurement import service
from app.modules.procurement.schemas.purchase_return import PurchaseReturnCreate

router = APIRouter(tags=["Procurement - Purchase Returns"])


@router.get("/procurement/purchase-returns")
async def list_purchase_returns(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    items = await service.list_returns(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_returns(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Purchase returns retrieved successfully")


@router.post("/procurement/purchase-returns")
async def create_purchase_return(data: PurchaseReturnCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_return(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Return recorded successfully", status_code=201)


@router.post("/procurement/purchase-returns/{id}/refund")
async def refund_purchase_return(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.mark_refunded(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Return marked as refunded")


@router.post("/procurement/purchase-returns/{id}/replace")
async def replace_purchase_return(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.mark_replaced(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Return marked as replaced")


@router.delete("/procurement/purchase-returns/{id}")
async def delete_purchase_return(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_return(db, current_user.tenant_id, id)
    return success_response(message="Return deleted successfully")
