import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.finance import service
from app.modules.finance.schemas import TransactionCreate, TransactionUpdate

router = APIRouter(tags=["Finance - Transactions"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/finance/transactions")
async def list_transactions(db: DbSession, current_user: CurrentUser, page_params: PageQuery, type: str | None = Query(None), status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_transactions(db, current_user.tenant_id, type, status, page_params.offset, page_params.limit)
    total = await service.count_transactions(db, current_user.tenant_id, type, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Transactions retrieved")


@router.post("/finance/transactions")
async def create_transaction(data: TransactionCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_transaction(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Transaction created", status_code=201)


@router.get("/finance/transactions/{id}")
async def get_transaction(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_transaction(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Transaction retrieved")


@router.patch("/finance/transactions/{id}")
async def update_transaction(id: uuid.UUID, data: TransactionUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_transaction(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Transaction updated")


@router.post("/finance/transactions/{id}/post")
async def post_transaction(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.post_transaction(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Transaction posted")


@router.post("/finance/transactions/{id}/void")
async def void_transaction(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.void_transaction(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Transaction voided")
