import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.hr import service
from app.modules.hr.schemas import PayrollCreate, PayrollUpdate

router = APIRouter(tags=["HR - Payroll"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/hr/payroll")
async def list_payroll(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: str | None = Query(None), status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_payroll(db, current_user.tenant_id, period, status, page_params.offset, page_params.limit)
    total = await service.count_payroll(db, current_user.tenant_id, period, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Payroll entries retrieved")


@router.post("/hr/payroll")
async def create_payroll(data: PayrollCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_payroll(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Payroll entry created", status_code=201)


@router.get("/hr/payroll/{id}")
async def get_payroll(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_payroll(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Payroll entry retrieved")


@router.patch("/hr/payroll/{id}")
async def update_payroll(id: uuid.UUID, data: PayrollUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_payroll(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Payroll entry updated")


@router.post("/hr/payroll/{id}/paid")
async def mark_paid(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.mark_paid(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Payroll entry marked as paid")


@router.delete("/hr/payroll/{id}")
async def delete_payroll(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_payroll(db, current_user.tenant_id, id)
    return success_response(message="Payroll entry deleted")
