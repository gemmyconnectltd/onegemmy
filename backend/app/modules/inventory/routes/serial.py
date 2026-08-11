import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import (
    SerialBulkCreate,
    SerialUpdate,
    WarrantyClaimCreate,
    WarrantyClaimUpdate,
)

router = APIRouter(tags=["Inventory - Serials & Warranty"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")


@router.get("/inventory/serials")
async def list_serials(db: DbSession, current_user: CurrentUser, page_params: PageQuery,
                       product_id: uuid.UUID | None = None, status: str | None = None):
    _require_tenant(current_user.tenant_id)
    items = await service.list_serials(db, current_user.tenant_id, product_id, status,
                                       page_params.offset, page_params.limit)
    total = await service.count_serials(db, current_user.tenant_id, product_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Serials retrieved successfully")


@router.post("/inventory/serials")
async def create_serials(data: SerialBulkCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    items = await service.create_serials(db, current_user.tenant_id, data)
    return success_response(data=[i.model_dump() for i in items],
                            message=f"{len(items)} serials registered", status_code=201)


@router.get("/inventory/serials/{id}")
async def get_serial(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_serial(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Serial retrieved successfully")


@router.patch("/inventory/serials/{id}")
async def update_serial(id: uuid.UUID, data: SerialUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_serial(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Serial updated successfully")


@router.delete("/inventory/serials/{id}")
async def delete_serial(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_serial(db, current_user.tenant_id, id)
    return success_response(message="Serial deleted successfully")


@router.get("/inventory/warranty")
async def list_warranty_claims(db: DbSession, current_user: CurrentUser, page_params: PageQuery,
                               status: str | None = None):
    _require_tenant(current_user.tenant_id)
    items = await service.list_warranty_claims(db, current_user.tenant_id, status,
                                               page_params.offset, page_params.limit)
    total = await service.count_warranty_claims(db, current_user.tenant_id, status)
    return paginated_response(items=[i.model_dump() for i in items], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Warranty claims retrieved successfully")


@router.post("/inventory/warranty")
async def create_warranty_claim(data: WarrantyClaimCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_warranty_claim(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Warranty claim submitted", status_code=201)


@router.get("/inventory/warranty/{id}")
async def get_warranty_claim(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_warranty_claim(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Warranty claim retrieved successfully")


@router.patch("/inventory/warranty/{id}")
async def update_warranty_claim(id: uuid.UUID, data: WarrantyClaimUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_warranty_claim(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Warranty claim updated successfully")
