import uuid

from fastapi import APIRouter, Query

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.accounting import service
from app.modules.accounting.schemas import ExpenseBulkCreate, ExpenseCreate, ExpenseUpdate
from app.modules.accounting.schemas.expense_workspace import ExpenseFilters
from app.modules.accounting.service import expense_workspace as workspace
from app.modules.accounting.service.workspace import allow, resolve_branch

router = APIRouter(tags=["Accounting - Expenses"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/accounting/expenses")
async def list_expenses(db: DbSession, current_user: CurrentUser, branch: ActiveBranchId, page_params: PageQuery, status: str | None = Query(None), search: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    result = await workspace.page(db, current_user, branch, ExpenseFilters(status=status, search=search or ""), page_params.page, min(page_params.page_size, 100))
    return paginated_response(items=result["items"], total=result["total"], page=page_params.page, page_size=result["page_size"], message="Expenses retrieved")


@router.post("/accounting/expenses")
async def create_expense(data: ExpenseCreate, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    obj = await workspace.create(db, current_user, branch, data)
    return success_response(data=obj.model_dump(), message="Expense created", status_code=201)


@router.post("/accounting/expenses/bulk")
async def bulk_create_expenses(data: ExpenseBulkCreate, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    tenant = allow(current_user, "expenses", "create")
    resolved = await resolve_branch(db, current_user, None, branch)
    for item in data.items:
        await workspace.validate_links(db, tenant, item.model_dump())
        await workspace.ensure_category(db, tenant, item.category)
        item.branch_id = resolved
    result = await service.bulk_create_expenses(db, current_user.tenant_id, current_user.id, data, current_user.full_name or current_user.email)
    return success_response(data=result.model_dump(), message=f"{result.created} expenses imported", status_code=201)


@router.get("/accounting/expenses/{id}")
async def get_expense(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    result = await workspace.detail(db, current_user, branch, id)
    return success_response(data=result["record"], message="Expense retrieved")


@router.patch("/accounting/expenses/{id}")
async def update_expense(id: uuid.UUID, data: ExpenseUpdate, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    obj = await workspace.edit(db, current_user, branch, id, data)
    return success_response(data=obj.model_dump(), message="Expense updated")


@router.post("/accounting/expenses/{id}/approve")
async def approve_expense(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    obj = await workspace.act(db, current_user, branch, id, "approve")
    return success_response(data=obj.model_dump(), message="Expense approved")


@router.post("/accounting/expenses/{id}/reject")
async def reject_expense(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    obj = await workspace.act(db, current_user, branch, id, "reject")
    return success_response(data=obj.model_dump(), message="Expense rejected")


@router.delete("/accounting/expenses/{id}")
async def delete_expense(id: uuid.UUID, db: DbSession, current_user: CurrentUser, branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    await workspace.act(db, current_user, branch, id, "delete")
    return success_response(message="Expense deleted")
