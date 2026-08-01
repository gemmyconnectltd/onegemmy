import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.finance import service
from app.modules.finance.schemas import AccountCreate, AccountUpdate
from app.modules.finance.service.account import seed_default_accounts

router = APIRouter(tags=["Finance - Accounts"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.post("/finance/accounts/seed")
async def seed_accounts(db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await seed_default_accounts(db, current_user.tenant_id)
    return success_response(message="Default chart of accounts seeded")


@router.get("/finance/accounts")
async def list_accounts(db: DbSession, current_user: CurrentUser, page_params: PageQuery, type: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_accounts(db, current_user.tenant_id, type, page_params.offset, page_params.limit)
    total = await service.count_accounts(db, current_user.tenant_id, type)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Accounts retrieved")


@router.post("/finance/accounts")
async def create_account(data: AccountCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_account(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Account created", status_code=201)


@router.get("/finance/accounts/{id}")
async def get_account(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_account(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Account retrieved")


@router.patch("/finance/accounts/{id}")
async def update_account(id: uuid.UUID, data: AccountUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_account(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Account updated")


@router.delete("/finance/accounts/{id}")
async def delete_account(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_account(db, current_user.tenant_id, id)
    return success_response(message="Account deleted")
