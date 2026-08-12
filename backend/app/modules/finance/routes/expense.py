import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.finance import service
from app.modules.finance.schemas import ExpenseCreate, ExpenseUpdate

router = APIRouter(tags=["Finance - Expenses"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/finance/expenses")
async def list_expenses(db: DbSession, current_user: CurrentUser, page_params: PageQuery, status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_expenses(db, current_user.tenant_id, status, page_params.offset, page_params.limit)
    total = await service.count_expenses(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Expenses retrieved")


@router.post("/finance/expenses")
async def create_expense(data: ExpenseCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_expense(db, current_user.tenant_id, current_user.id, data, current_user.full_name or current_user.email)
    return success_response(data=obj.model_dump(), message="Expense created", status_code=201)


@router.get("/finance/expenses/{id}")
async def get_expense(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_expense(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Expense retrieved")


@router.patch("/finance/expenses/{id}")
async def update_expense(id: uuid.UUID, data: ExpenseUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_expense(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Expense updated")


@router.post("/finance/expenses/{id}/approve")
async def approve_expense(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.approve_expense(db, current_user.tenant_id, id, current_user.id, current_user.full_name or current_user.email)
    return success_response(data=obj.model_dump(), message="Expense approved")


@router.post("/finance/expenses/{id}/reject")
async def reject_expense(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.reject_expense(db, current_user.tenant_id, id, current_user.id, current_user.full_name or current_user.email)
    return success_response(data=obj.model_dump(), message="Expense rejected")


@router.delete("/finance/expenses/{id}")
async def delete_expense(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_expense(db, current_user.tenant_id, id)
    return success_response(message="Expense deleted")
