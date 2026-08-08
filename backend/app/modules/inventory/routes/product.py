import uuid

from fastapi import APIRouter, File, UploadFile

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import (
    ProductBulkCreate,
    ProductCreate,
    ProductUpdate,
    RestockRequest,
)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

router = APIRouter(tags=["Inventory - Products"])


@router.get("/inventory/products")
async def list_products(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    _require_tenant(current_user.tenant_id)
    items = await service.list_products(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_products(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Products retrieved successfully")


@router.post("/inventory/products")
async def create_product(data: ProductCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_product(db, current_user.tenant_id, data)
    return success_response(data=obj.model_dump(), message="Product created successfully", status_code=201)


@router.post("/inventory/products/bulk")
async def bulk_create_products(data: ProductBulkCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    result = await service.bulk_create_products(db, current_user.tenant_id, data)
    return success_response(data=result.model_dump(), message=f"{result.created} products created", status_code=201)


@router.get("/inventory/products/{id}")
async def get_product(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_product(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Product retrieved successfully")


@router.patch("/inventory/products/{id}")
async def update_product(id: uuid.UUID, data: ProductUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_product(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Product updated successfully")


@router.delete("/inventory/products/{id}")
async def delete_product(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_product(db, current_user.tenant_id, id)
    return success_response(message="Product deleted successfully")


@router.post("/inventory/products/{id}/image")
async def upload_product_image(id: uuid.UUID, db: DbSession, current_user: CurrentUser, file: UploadFile = File(...)):
    _require_tenant(current_user.tenant_id)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Only JPEG, PNG, and WebP images are allowed")
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise ValidationError("Image must be under 5MB")
    obj = await service.upload_product_image(db, current_user.tenant_id, id, file.filename or "image", content)
    return success_response(data=obj.model_dump(), message="Image uploaded successfully")


@router.delete("/inventory/products/{id}/image")
async def delete_product_image(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.delete_product_image(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Image removed successfully")


@router.post("/inventory/products/{id}/restock")
async def restock_product(id: uuid.UUID, data: RestockRequest, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.restock_product(db, current_user.tenant_id, id, data)
    return success_response(data=obj.model_dump(), message="Stock updated successfully")
