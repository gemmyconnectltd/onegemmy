import uuid

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory.service.batch import (
    count_batches, create_batch, delete_batch, get_batch, list_batches, update_batch,
)
from app.modules.inventory.schemas.batch import BatchCreate, BatchUpdate

router = APIRouter(tags=["Inventory - Batches"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/inventory/batches")
async def list_batches_route(
    db: DbSession, current_user: CurrentUser, page_params: PageQuery,
    product_id: uuid.UUID | None = Query(None),
    expiring_in_days: int | None = Query(None, description="Filter batches expiring within N days"),
):
    _require_tenant(current_user.tenant_id)
    items = await list_batches(db, current_user.tenant_id, product_id, expiring_in_days, page_params.offset, page_params.limit)
    total = await count_batches(db, current_user.tenant_id, product_id, expiring_in_days)
    return paginated_response(items=[i.model_dump() for i in items], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Batches retrieved successfully")


@router.post("/inventory/batches")
async def create_batch_route(data: BatchCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await create_batch(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Batch created", status_code=201)


@router.get("/inventory/batches/{id}")
async def get_batch_route(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await get_batch(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Batch retrieved")


@router.patch("/inventory/batches/{id}")
async def update_batch_route(id: uuid.UUID, data: BatchUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await update_batch(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Batch updated")


@router.delete("/inventory/batches/{id}")
async def delete_batch_route(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await delete_batch(db, current_user.tenant_id, id)
    return success_response(message="Batch deleted")
