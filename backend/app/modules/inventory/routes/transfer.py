import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import StockTransferCreate, StockTransferUpdate

router = APIRouter(tags=["Inventory - Stock Transfers"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")


@router.get("/inventory/transfers")
async def list_transfers(db: DbSession, current_user: CurrentUser, page_params: PageQuery,
                         status: str | None = None):
    _require_tenant(current_user.tenant_id)
    items = await service.list_transfers(db, current_user.tenant_id, status,
                                         page_params.offset, page_params.limit)
    total = await service.count_transfers(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Transfers retrieved successfully")


@router.post("/inventory/transfers")
async def create_transfer(data: StockTransferCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_transfer(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Transfer created successfully", status_code=201)


@router.get("/inventory/transfers/{id}")
async def get_transfer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_transfer(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Transfer retrieved successfully")


@router.patch("/inventory/transfers/{id}")
async def update_transfer(id: uuid.UUID, data: StockTransferUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_transfer(db, current_user.tenant_id, id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Transfer updated successfully")


@router.delete("/inventory/transfers/{id}")
async def delete_transfer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_transfer(db, current_user.tenant_id, id)
    return success_response(message="Transfer deleted successfully")
