import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Query, UploadFile

from app.core.deps import ActiveBranchId, CurrentUser, DbSession, require_permission
from app.core.exceptions import ValidationError
from app.core.period import PeriodQuery


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
async def list_products(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: PeriodQuery,
                        search: str | None = None, is_active: bool | None = None, category_id: uuid.UUID | None = None):
    _require_tenant(current_user.tenant_id)
    items = await service.list_products(db, current_user.tenant_id, page_params.offset, page_params.limit, search, is_active, period, category_id)
    total = await service.count_products(db, current_user.tenant_id, search, is_active, period, category_id)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Products retrieved successfully")


@router.get("/inventory/products/low-stock")
async def low_stock_report(db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    report = await service.low_stock_report(db, current_user.tenant_id)
    return success_response(data=report.model_dump(), message="Low stock report retrieved successfully")


@router.get("/inventory/products/barcode/{code}")
async def get_product_by_barcode(code: str, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_product_by_barcode(db, current_user.tenant_id, code)
    return success_response(data=obj.model_dump(), message="Product retrieved successfully")


@router.post("/inventory/products")
async def create_product(data: ProductCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_product(db, current_user.tenant_id, data, actor=current_user)
    return success_response(data=obj.model_dump(), message="Product created successfully", status_code=201)


@router.post("/inventory/products/import-pictures", dependencies=[Depends(require_permission("items:create"))])
async def import_product_pictures(db: DbSession, current_user: CurrentUser, file: UploadFile = File(...)):
    """A ZIP of pictures named after each product's SKU or barcode. Pictures that match are attached; the rest are listed with the reason."""
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service.product_image_import import MAX_ZIP_BYTES, import_pictures
    content = await file.read(MAX_ZIP_BYTES + 1)
    result = await import_pictures(db, current_user.tenant_id, content, actor=current_user)
    return success_response(data=result, message=f"{result['matched']} pictures attached")


@router.post("/inventory/products/bulk")
async def bulk_create_products(data: ProductBulkCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    result = await service.bulk_create_products(db, current_user.tenant_id, data, actor=current_user)
    return success_response(data=result.model_dump(), message=f"{result.created} products created", status_code=201)


@router.get("/inventory/products/{id}")
async def get_product(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_product(db, current_user.tenant_id, id)
    return success_response(data=obj.model_dump(), message="Product retrieved successfully")


@router.patch("/inventory/products/{id}")
async def update_product(id: uuid.UUID, data: ProductUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    from app.modules.approvals.service import can_decide
    obj = await service.update_product(db, current_user.tenant_id, id, data, can_approve=can_decide(current_user), actor=current_user)
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
    obj = await service.upload_product_image(db, current_user.tenant_id, id, file.filename or "image", content, actor=current_user)
    return success_response(data=obj.model_dump(), message="Image uploaded successfully")


@router.delete("/inventory/products/{id}/image")
async def delete_product_image(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.delete_product_image(db, current_user.tenant_id, id, actor=current_user)
    return success_response(data=obj.model_dump(), message="Image removed successfully")


async def _read_image(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationError("Only JPEG, PNG, and WebP images are allowed")
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise ValidationError("Image must be under 5MB")
    return content


@router.get("/inventory/products/{id}/images")
async def product_gallery(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service import product_gallery as gallery
    return success_response(data=await gallery.gallery(db, current_user.tenant_id, id), message="Pictures retrieved")


@router.post("/inventory/products/{id}/images")
async def add_product_image(id: uuid.UUID, db: DbSession, current_user: CurrentUser, file: UploadFile = File(...)):
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service import product_gallery as gallery
    content = await _read_image(file)
    return success_response(data=await gallery.add_image(db, current_user.tenant_id, id, file.filename or "image", content), message="Picture added", status_code=201)


@router.delete("/inventory/products/{id}/images/{image_id}")
async def remove_product_image(id: uuid.UUID, image_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service import product_gallery as gallery
    return success_response(data=await gallery.remove_image(db, current_user.tenant_id, id, image_id), message="Picture removed")


@router.post("/inventory/products/{id}/images/{image_id}/make-main")
async def make_main_product_image(id: uuid.UUID, image_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service import product_gallery as gallery
    return success_response(data=await gallery.make_main(db, current_user.tenant_id, id, image_id), message="Main picture changed")


@router.post("/inventory/products/{id}/restock")
async def restock_product(id: uuid.UUID, data: RestockRequest, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.restock_product(db, current_user.tenant_id, id, data, actor=current_user)
    return success_response(data=obj.model_dump(), message="Stock updated successfully")


@router.get("/inventory/products/{id}/details")
async def product_details(id: uuid.UUID, db: DbSession, current_user: CurrentUser,
                          branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service.history import product_details
    return success_response(data=await product_details(db, current_user, id, branch))


@router.get("/inventory/products/{id}/history")
async def product_history(id: uuid.UUID, db: DbSession, current_user: CurrentUser,
                          page: PageQuery, period: PeriodQuery, branch: ActiveBranchId,
                          category: Literal["all", "movements", "prices", "updates", "transfers", "returns", "purchases"] = "all",
                          kind: Literal["sale", "purchase", "receipt", "transfer", "adjustment"] | None = None,
                          search: str | None = Query(None, max_length=120),
                          actor_id: uuid.UUID | None = None, branch_id: uuid.UUID | None = None,
                          export_csv: bool = False):
    _require_tenant(current_user.tenant_id)
    from app.core.branches import branch_allowed
    from app.core.exceptions import ForbiddenError
    from app.modules.inventory.service.history import product_history
    if branch_id and (not branch_allowed(current_user, branch_id) or (branch and branch != branch_id)):
        raise ForbiddenError("Select this branch in the workspace first")
    if export_csv:
        from app.modules.inventory.service.history import history_export
        return await history_export(db, current_user, id, period, category, kind, search, actor_id, branch_id or branch)
    data = await product_history(db, current_user, id, period, page.offset, page.limit,
                                 category, kind, search, actor_id, branch_id or branch)
    return success_response(data={**data, "page": page.page, "page_size": page.page_size})
