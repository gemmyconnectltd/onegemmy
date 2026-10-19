import uuid
from datetime import date

from fastapi import APIRouter, Query

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import NotFoundError, ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.procurement import service
from app.modules.procurement.repository import PurchaseOrderRepository
from app.modules.procurement.schemas import PurchaseCreate, PurchaseUpdate
from app.modules.procurement.schemas.supplier_bill import ReceiveTerms

router = APIRouter(tags=["Procurement - Purchase Orders"])


async def _access(db, user, branch, action, identity=None):
    from app.modules.accounting.service.workspace import allow, resolve_branch

    tenant = allow(user, "purchase_orders", action)
    scoped = await resolve_branch(db, user, None, branch)
    if identity:
        record = await PurchaseOrderRepository(db).get_by_id_for_tenant(tenant, identity)
        if record is None or (scoped and record.branch_id != scoped):
            raise NotFoundError("Purchase not found in this branch")
    return scoped


@router.get("/procurement/purchase-orders")
async def list_purchase_orders(db: DbSession, current_user: CurrentUser, page_params: PageQuery, branch: ActiveBranchId, status: str | None = None, search: str | None = Query(None, max_length=100), from_date: date | None = None, to_date: date | None = None):
    from app.modules.accounting.service.workspace import allow, resolve_branch

    tenant = allow(current_user, "purchase_orders")
    branch_id = await resolve_branch(db, current_user, None, branch)
    if from_date and to_date and from_date > to_date:
        raise ValidationError("Start date must not follow end date")
    filters = {"search": search, "from_date": from_date, "to_date": to_date, "branch_id": branch_id}
    size = min(page_params.page_size, 100)
    items = await service.list_purchases(db, tenant, status, (page_params.page - 1) * size, size, **filters)
    total = await service.count_purchases(db, tenant, status, **filters)
    summary = await PurchaseOrderRepository(db).history_summary(tenant, **filters)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=size, message="Purchase history retrieved", summary=summary)


@router.post("/procurement/purchase-orders")
async def create_purchase_order(data: PurchaseCreate, db: DbSession, current_user: CurrentUser, active_branch_id: ActiveBranchId):
    active_branch_id = await _access(db, current_user, active_branch_id, "create")
    if data.branch_id:
        from app.modules.accounting.service.workspace import resolve_branch
        await resolve_branch(db, current_user, data.branch_id, active_branch_id)
    obj = await service.create_purchase(db, current_user.tenant_id, current_user.id, data, active_branch_id)
    return success_response(data=obj.model_dump(), message="Purchase order created successfully", status_code=201)


@router.get("/procurement/purchase-orders/{id}")
async def get_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _access(db, current_user, branch, "read", id)
    obj = await service.get_purchase(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Purchase order retrieved successfully")


@router.patch("/procurement/purchase-orders/{id}")
async def update_purchase_order(id: uuid.UUID, data: PurchaseUpdate, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _access(db, current_user, branch, "update", id)
    if data.branch_id:
        from app.modules.accounting.service.workspace import resolve_branch
        await resolve_branch(db, current_user, data.branch_id, branch)
    obj = await service.update_purchase(db, current_user.tenant_id, id, data, current_user.id)
    return success_response(data=obj.model_dump(), message="Purchase order updated successfully")


@router.post("/procurement/purchase-orders/{id}/receive")
async def receive_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, data: ReceiveTerms | None = None):
    await _access(db, current_user, branch, "update", id)
    obj = await service.receive_purchase(db, current_user.tenant_id, id, current_user.id, data.due_date if data else None)
    return success_response(data=obj.model_dump(), message="Purchase order received and stock updated")


@router.post("/procurement/purchase-orders/{id}/cancel")
async def cancel_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _access(db, current_user, branch, "update", id)
    obj = await service.cancel_purchase(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Purchase order cancelled")


@router.delete("/procurement/purchase-orders/{id}")
async def delete_purchase_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _access(db, current_user, branch, "delete", id)
    await service.delete_purchase(db, current_user.tenant_id, id)
    return success_response(message="Purchase order deleted successfully")
