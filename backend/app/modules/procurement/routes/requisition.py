import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.procurement import service
from app.modules.procurement.schemas.requisition import RequisitionCreate

router = APIRouter(tags=["Procurement - Requisitions"])


@router.get("/procurement/requisitions")
async def list_requisitions(db: DbSession, current_user: CurrentUser, page_params: PageQuery, status: str | None = None):
    items = await service.list_requisitions(db, current_user.tenant_id, status, page_params.offset, page_params.limit)
    total = await service.count_requisitions(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Requisitions retrieved successfully")


@router.post("/procurement/requisitions")
async def create_requisition(data: RequisitionCreate, db: DbSession, current_user: CurrentUser):
    obj = await service.create_requisition(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Requisition submitted successfully", status_code=201)


@router.post("/procurement/requisitions/{id}/approve")
async def approve_requisition(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.approve_requisition(db, current_user.tenant_id, id, current_user.id)
    return success_response(data=obj.model_dump(), message="Requisition approved")


@router.post("/procurement/requisitions/{id}/reject")
async def reject_requisition(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    obj = await service.reject_requisition(db, current_user.tenant_id, id, current_user.id)
    return success_response(data=obj.model_dump(), message="Requisition rejected")


@router.delete("/procurement/requisitions/{id}")
async def delete_requisition(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_requisition(db, current_user.tenant_id, id)
    return success_response(message="Requisition deleted successfully")
