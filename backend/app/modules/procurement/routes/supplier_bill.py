import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.procurement import service
from app.modules.procurement.schemas.supplier_bill import SupplierPaymentCreate

router = APIRouter(tags=["Procurement - Supplier Bills"])


@router.get("/procurement/supplier-bills")
async def list_supplier_bills(db: DbSession, current_user: CurrentUser, page_params: PageQuery, status: str | None = Query(None)):
    items = await service.list_bills(db, current_user.tenant_id, status, page_params.offset, page_params.limit)
    total = await service.count_bills(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Supplier bills retrieved successfully")


@router.get("/procurement/supplier-bills/{id}")
async def get_supplier_bill(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.get_bill(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump())


@router.get("/procurement/supplier-bills/{id}/payments")
async def list_supplier_bill_payments(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    payments = await service.list_payments(db, current_user.tenant_id, id)
    return success_response(data=[p.model_dump() for p in payments])


@router.post("/procurement/supplier-bills/{id}/payments")
async def record_supplier_payment(id: uuid.UUID, data: SupplierPaymentCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.record_payment(db, current_user.tenant_id, current_user.id, id, data)
    return success_response(data=obj.model_dump(), message="Payment recorded successfully", status_code=201)
