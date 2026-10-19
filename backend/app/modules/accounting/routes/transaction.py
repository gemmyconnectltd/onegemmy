import uuid

from fastapi import APIRouter, Query

from app.core.branches import has_branch_restriction
from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.accounting import service
from app.modules.accounting.schemas import TransactionCreate, TransactionUpdate

router = APIRouter(tags=["Accounting - Transactions"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/accounting/transactions")
async def list_transactions(db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId, page_params: PageQuery, type: str | None = Query(None), status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    from app.modules.accounting.service.workspace import allow, resolve_branch
    allow(current_user, "journal_entries")
    branch_id = await resolve_branch(db, current_user, None, branch_id)
    items = await service.list_transactions(db, current_user.tenant_id, type, status, page_params.offset, min(page_params.limit, 100), branch_id)
    total = await service.count_transactions(db, current_user.tenant_id, type, status, branch_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=min(page_params.page_size, 100), message="Transactions retrieved")


@router.post("/accounting/transactions")
async def create_transaction(data: TransactionCreate, db: DbSession, current_user: CurrentUser, branch_id: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    from app.modules.accounting.service.workspace import resolve_branch
    data.branch_id = await resolve_branch(db, current_user, data.branch_id, branch_id)
    obj = await service.create_transaction(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Transaction created", status_code=201)


@router.post("/accounting/transactions/backfill-sales")
async def backfill_sales(db: DbSession, current_user: CurrentUser):
    """Create accounting transactions for all completed orders that don't have one yet."""
    _require_tenant(current_user.tenant_id)
    from app.core.exceptions import ForbiddenError
    from app.modules.accounting.service.workspace import allow
    allow(current_user, "journal_entries", "approve")
    if has_branch_restriction(current_user):
        raise ForbiddenError("Backfill requires an unrestricted finance account")
    count = await service.backfill_sale_transactions(db, current_user.tenant_id, current_user.id)
    return success_response(data={"created": count}, message=f"Backfilled {count} transaction(s)")


@router.get("/accounting/transactions/{id}")
async def get_transaction(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    from app.modules.accounting.service.workspace import journal_detail
    return success_response(await journal_detail(db, current_user, id))


@router.patch("/accounting/transactions/{id}")
async def update_transaction(id: uuid.UUID, data: TransactionUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_transaction(db, current_user.tenant_id, id, data, current_user)
    return success_response(data=obj.model_dump(), message="Transaction updated")


@router.post("/accounting/transactions/{id}/post")
async def post_transaction(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.post_transaction(db, current_user.tenant_id, id, current_user.id, current_user.full_name or current_user.email)
    return success_response(data=obj.model_dump(), message="Transaction posted")


@router.post("/accounting/transactions/{id}/void")
async def void_transaction(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.void_transaction(db, current_user.tenant_id, id, current_user.id, current_user.full_name or current_user.email)
    return success_response(data=obj.model_dump(), message="Transaction voided")
