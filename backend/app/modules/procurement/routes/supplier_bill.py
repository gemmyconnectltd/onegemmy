import uuid

from fastapi import APIRouter, Query

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.procurement import service
from app.modules.procurement.schemas.supplier_bill import BillMetadataUpdate, SupplierPaymentCreate

router = APIRouter(tags=["Procurement - Supplier Bills"])


@router.get("/procurement/supplier-bills")
async def list_supplier_bills(db: DbSession, current_user: CurrentUser, page_params: PageQuery, branch: ActiveBranchId, status: str | None = Query(None), purchase_order_id: uuid.UUID | None = None):
    scoped = await _bill_access(db, current_user, branch)
    items = await service.list_bills(db, current_user.tenant_id, status, page_params.offset, min(page_params.limit, 100), branch_id=scoped, order_id=purchase_order_id)
    total = await service.count_bills(db, current_user.tenant_id, status, branch_id=scoped, order_id=purchase_order_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Supplier bills retrieved successfully")


@router.get("/procurement/supplier-bills/{id}")
async def get_supplier_bill(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _bill_access(db, current_user, branch, id)
    obj = await service.get_bill(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump())


@router.get("/procurement/supplier-bills/{id}/payments")
async def list_supplier_bill_payments(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, page_params: PageQuery):
    await _bill_access(db, current_user, branch, id)
    payments = await service.list_payments(db, current_user.tenant_id, id, page_params.offset, min(page_params.limit, 100))
    from app.modules.procurement.repository.supplier_bill import SupplierPaymentRepository
    total = await SupplierPaymentRepository(db).count_for_bill(current_user.tenant_id, id)
    return paginated_response(items=[p.model_dump() for p in payments], total=total, page=page_params.page, page_size=min(page_params.page_size, 100))


@router.post("/procurement/supplier-bills/{id}/payments")
async def record_supplier_payment(id: uuid.UUID, data: SupplierPaymentCreate, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    await _bill_access(db, current_user, branch, id, "create")
    obj = await service.record_payment(db, current_user.tenant_id, current_user.id, id, data, current_user)
    return success_response(data=obj.model_dump(), message="Payment recorded successfully", status_code=201)


async def _bill_access(db, user, branch, id=None, action="read"):
    from app.core.exceptions import NotFoundError
    from app.modules.accounting.service.workspace import allow, resolve_branch
    from app.modules.procurement.repository.supplier_bill import SupplierBillRepository
    tenant = allow(user, "accounts_payable", action)
    scoped = await resolve_branch(db, user, None, branch)
    if id:
        bill = await SupplierBillRepository(db).get_by_id_for_tenant(tenant, id)
        if bill is None or (scoped and bill.purchase_order.branch_id != scoped):
            raise NotFoundError("Supplier bill not found in this branch")
    return scoped


@router.patch("/procurement/supplier-bills/{id}")
async def update_supplier_invoice(id: uuid.UUID, data: BillMetadataUpdate, db: DbSession,
                                  current_user: CurrentUser, branch: ActiveBranchId):
    from app.modules.procurement.service.supplier_bill import update_bill_metadata
    await _bill_access(db, current_user, branch, id, "update")
    bill = await update_bill_metadata(db, current_user.tenant_id, id, current_user.id, data)
    return success_response(data=bill.model_dump(), message="Supplier invoice details recorded")
