import uuid

from fastapi import APIRouter, File, UploadFile

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import VariantCreate, VariantUpdate, RestockRequest

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024

router = APIRouter(tags=["Inventory - Variants"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/inventory/variants")
async def list_all_variants(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    _require_tenant(current_user.tenant_id)
    items = await service.list_all_variants(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_all_variants(db, current_user.tenant_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Variants retrieved successfully")


@router.get("/inventory/products/{product_id}/variants")
async def list_variants(product_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    items = await service.list_variants(db, current_user.tenant_id, product_id)
    return success_response(data=[i.model_dump() for i in items], message="Variants retrieved")


@router.post("/inventory/products/{product_id}/variants")
async def create_variant(product_id: uuid.UUID, data: VariantCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_variant(db, current_user.tenant_id, product_id, data)
    return success_response(data=obj.model_dump(), message="Variant created", status_code=201)


@router.get("/inventory/products/{product_id}/variants/{id}")
async def get_variant(product_id: uuid.UUID, id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_variant(db, current_user.tenant_id, product_id, id)
    return success_response(data=obj.model_dump(), message="Variant retrieved")


@router.patch("/inventory/products/{product_id}/variants/{id}")
async def update_variant(product_id: uuid.UUID, id: uuid.UUID, data: VariantUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_variant(db, current_user.tenant_id, product_id, id, data)
    return success_response(data=obj.model_dump(), message="Variant updated")


@router.post("/inventory/products/{product_id}/variants/{id}/restock")
async def restock_variant(product_id: uuid.UUID, id: uuid.UUID, data: RestockRequest, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.restock_variant(db, current_user.tenant_id, product_id, id, data.qty, data.mode)
    return success_response(data=obj.model_dump(), message="Variant stock updated")


@router.post("/inventory/products/{product_id}/variants/{id}/image")
async def upload_variant_image(product_id: uuid.UUID, id: uuid.UUID, db: DbSession, current_user: CurrentUser, file: UploadFile = File(...)):
    _require_tenant(current_user.tenant_id)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Only JPEG, PNG, and WebP images are allowed")
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise ValidationError("Image must be under 5MB")
    obj = await service.upload_variant_image(db, current_user.tenant_id, product_id, id, file.filename or "image", content)
    return success_response(data=obj.model_dump(), message="Variant image uploaded")


@router.delete("/inventory/products/{product_id}/variants/{id}")
async def delete_variant(product_id: uuid.UUID, id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_variant(db, current_user.tenant_id, product_id, id)
    return success_response(message="Variant deleted")
