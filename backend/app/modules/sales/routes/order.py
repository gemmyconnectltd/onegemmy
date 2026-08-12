import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas import OrderCreate, OrderUpdate

router = APIRouter(tags=["Sales - Orders"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/orders")
async def list_orders(db: DbSession, current_user: CurrentUser, page_params: PageQuery, status: str | None = Query(None)):
    _require_tenant(current_user.tenant_id)
    items = await service.list_orders(db, current_user.tenant_id, status, page_params.offset, page_params.limit)
    total = await service.count_orders(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Orders retrieved successfully")


@router.post("/sales/orders")
async def create_order(data: OrderCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_order(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Order created successfully", status_code=201)


@router.get("/sales/orders/{id}")
async def get_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_order(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Order retrieved successfully")


@router.patch("/sales/orders/{id}")
async def update_order(id: uuid.UUID, data: OrderUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_order(
        db, current_user.tenant_id, id, data,
        user_id=current_user.id, user_name=current_user.full_name or current_user.email,
    )
    return success_response(data=obj.model_dump(), message="Order updated successfully")


@router.delete("/sales/orders/{id}")
async def delete_order(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_order(
        db, current_user.tenant_id, id,
        user_id=current_user.id, user_name=current_user.full_name or current_user.email,
    )
    return success_response(message="Order deleted successfully")
