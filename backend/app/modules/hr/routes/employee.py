import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.hr import service
from app.modules.hr.schemas import EmployeeCreate, EmployeeUpdate

router = APIRouter(tags=["HR - Employees"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/hr/employees")
async def list_employees(db: DbSession, current_user: CurrentUser, page_params: PageQuery, status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_employees(db, current_user.tenant_id, status, page_params.offset, page_params.limit)
    total = await service.count_employees(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Employees retrieved")


@router.post("/hr/employees")
async def create_employee(data: EmployeeCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_employee(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Employee created", status_code=201)


@router.get("/hr/employees/{id}")
async def get_employee(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_employee(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Employee retrieved")


@router.patch("/hr/employees/{id}")
async def update_employee(id: uuid.UUID, data: EmployeeUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_employee(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Employee updated")


@router.delete("/hr/employees/{id}")
async def delete_employee(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_employee(db, current_user.tenant_id, id)
    return success_response(message="Employee deleted")
