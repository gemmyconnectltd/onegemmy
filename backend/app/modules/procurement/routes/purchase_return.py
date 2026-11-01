import uuid

from fastapi import APIRouter, Query

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.procurement import service
from app.modules.procurement.schemas.purchase_return import (
    PurchaseReturnCreate,
    SupplierRefundInput,
)

router = APIRouter(tags=["Procurement - Purchase Returns"])


@router.get("/procurement/purchase-returns")
async def list_purchase_returns(db: DbSession, current_user: CurrentUser, page_params: PageQuery, branch: ActiveBranchId, search: str | None = Query(None, max_length=100)):
    scoped = await _return_access(db, current_user, branch)
    items = await service.list_returns(db, current_user.tenant_id, page_params.offset, min(page_params.limit, 100), scoped, search)
    total = await service.count_returns(db, current_user.tenant_id, scoped, search)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Purchase returns retrieved successfully")


@router.post("/procurement/purchase-returns")
async def create_purchase_return(data: PurchaseReturnCreate, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    from app.modules.procurement.routes.purchase import _access
    await _access(db, current_user, branch, "update", data.purchase_order_id)
    obj = await service.create_return(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Return recorded successfully", status_code=201)


@router.post("/procurement/purchase-returns/{id}/refund")
async def refund_purchase_return(id: uuid.UUID, data: SupplierRefundInput, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _return_access(db, current_user, branch, id, "update")
    obj = await service.mark_refunded(db, current_user.tenant_id, id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Return marked as refunded")


@router.post("/procurement/purchase-returns/{id}/replace")
async def replace_purchase_return(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _return_access(db, current_user, branch, id, "update")
    obj = await service.mark_replaced(db, current_user.tenant_id, id, current_user.id)
    return success_response(data=obj.model_dump(), message="Return marked as replaced")


@router.delete("/procurement/purchase-returns/{id}")
async def delete_purchase_return(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _return_access(db, current_user, branch, id, "delete")
    await service.delete_return(db, current_user.tenant_id, id, current_user.id)
    return success_response(message="Return deleted successfully")


async def _return_access(db, user, branch, id=None, action="read"):
    from app.core.exceptions import NotFoundError
    from app.modules.procurement.repository.purchase_return import PurchaseReturnRepository
    from app.modules.procurement.routes.purchase import _access
    if id:
        obj = await PurchaseReturnRepository(db).get_by_id_for_tenant(user.tenant_id, id)
        if obj is None:
            raise NotFoundError("Return not found")
        return await _access(db, user, branch, action, obj.purchase_order_id)
    return await _access(db, user, branch, action)
