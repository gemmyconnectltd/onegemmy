import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.finance import service
from app.modules.finance.schemas import BudgetCreate, BudgetUpdate

router = APIRouter(tags=["Finance - Budgets"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/finance/budgets")
async def list_budgets(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_budgets(db, current_user.tenant_id, period, page_params.offset, page_params.limit)
    total = await service.count_budgets(db, current_user.tenant_id, period)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Budgets retrieved")


@router.post("/finance/budgets")
async def create_budget(data: BudgetCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_budget(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Budget created", status_code=201)


@router.get("/finance/budgets/{id}")
async def get_budget(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_budget(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Budget retrieved")


@router.patch("/finance/budgets/{id}")
async def update_budget(id: uuid.UUID, data: BudgetUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_budget(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Budget updated")


@router.delete("/finance/budgets/{id}")
async def delete_budget(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_budget(db, current_user.tenant_id, id)
    return success_response(message="Budget deleted")
