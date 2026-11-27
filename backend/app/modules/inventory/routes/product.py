import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, Field

from app.core.deps import ActiveBranchId, CurrentUser, DbSession, require_permission
from app.core.exceptions import ForbiddenError, ValidationError
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
from app.modules.inventory.schemas.product import VatClassification

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB

router = APIRouter(tags=["Inventory - Products"])


@router.get("/inventory/products")
async def list_products(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: PeriodQuery, active_branch: ActiveBranchId,
                        search: str | None = None, is_active: bool | None = None, category_id: uuid.UUID | None = None,
                        vat: Literal["standard", "zero_rated", "exempt", "out_of_scope", "not_reviewed"] | None = None,
                        for_sale: bool = Query(False, description="Stock as the till sees it: what the selling warehouse of the active branch holds"),
                        per_branch: bool = Query(False, description="Also give each product's quantity and status in every branch the person may see"),
                        brand_id: uuid.UUID | None = None, supplier_id: uuid.UUID | None = None, unit_id: uuid.UUID | None = None,
                        kind: Literal["simple", "variants", "serials", "weight"] | None = None,
                        stock: Literal["in", "low", "out", "negative"] | None = Query(None, description="Stock in the branch being viewed (or the business)"),
                        price_min: float | None = Query(None, ge=0), price_max: float | None = Query(None, ge=0),
                        updated_from: date | None = None, updated_to: date | None = None,
                        stock_branch: uuid.UUID | None = Query(None, description="Read the stock filter in this branch instead of the one in the top bar")):
    _require_tenant(current_user.tenant_id)
    sale_branch = await _sale_branch(db, current_user, active_branch) if for_sale else None
    more = await _more_filters(db, current_user, stock_branch or active_branch, brand_id, supplier_id, unit_id, kind, stock, price_min, price_max, updated_from, updated_to)
    items = await service.list_products(db, current_user.tenant_id, page_params.offset, page_params.limit, search, is_active, period, category_id, vat,
                                        sale_branch, more)
    await _scope_stock(db, current_user, items, active_branch, for_sale)
    if sale_branch is not None:
        from app.modules.inventory.service import branch_pricing
        await branch_pricing.apply_prices(db, current_user.tenant_id, sale_branch, items)
    total = await service.count_products(db, current_user.tenant_id, search, is_active, period, category_id, vat, sale_branch, more)
    columns = None
    if per_branch and not for_sale:
        from app.modules.inventory.service.branch_inventory import attach_per_branch
        columns = await attach_per_branch(db, current_user, items)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size,
                              message="Products retrieved successfully", summary={"branches": columns} if per_branch else None)


async def _more_filters(db, user, active_branch, brand_id, supplier_id, unit_id, kind, stock, price_min, price_max, updated_from, updated_to):
    """The "More filters" of the Products list, or None when none is set. Stock reads the warehouses the person is looking at."""
    from app.core.period import DatePeriod
    from app.modules.inventory.repository.product import ProductFilters
    if price_min is not None and price_max is not None and price_min > price_max:
        raise ValidationError("The lowest price must not be above the highest price.")
    if updated_from and updated_to and updated_from > updated_to:
        raise ValidationError("The 'updated from' date must not be after the 'updated to' date.")
    if not any(v is not None for v in (brand_id, supplier_id, unit_id, kind, stock, price_min, price_max, updated_from, updated_to)):
        return None
    warehouses, uses = None, False
    if stock:
        from app.modules.inventory.service import branch_stock
        mine = branch_stock.restricted_branches(user)
        if active_branch is not None and mine is not None and active_branch not in mine:
            raise ForbiddenError("You can only see stock in your own branches.")
        seen = await branch_stock.viewing_warehouses(db, user, active_branch)
        warehouses = sorted(seen) if seen is not None else None
        uses = seen is not None or bool(await branch_stock._warehouses(db, user.tenant_id, active_only=False))
    return ProductFilters(brand_id=brand_id, supplier_id=supplier_id, unit_id=unit_id, kind=kind, stock=stock, price_min=price_min, price_max=price_max,
                          updated=DatePeriod(from_date=updated_from, to_date=updated_to) if updated_from or updated_to else None,
                          warehouses=warehouses, uses_warehouses=uses)


async def _sale_branch(db, user, active_branch) -> uuid.UUID | None:
    """The branch the till sells in, when the business uses branch prices (its products and prices depend on it)."""
    from app.modules.inventory.service import branch_pricing, branch_stock
    branch = active_branch or (user.branch_id if branch_stock.restricted_branches(user) else None)
    return branch if branch is not None and await branch_pricing.is_enabled(db, user.tenant_id) else None


async def _scope_stock(db, user, items, branch_id, for_sale: bool) -> None:
    """With warehouses switched on, show stock where this person works: the till sees its selling warehouse, a chosen branch shows
    only that branch's stock, branch staff see their branches' warehouses, and "All branches" keeps the business total."""
    from app.modules.inventory.service import branch_stock
    if for_sale:
        try:
            warehouse = await branch_stock.selling_warehouse(db, user.tenant_id, branch_id or (user.branch_id if branch_stock.restricted_branches(user) else None))
        except branch_stock.NoBranchWarehouse:
            warehouse = False  # nothing serves this branch: it shows no stock rather than another branch's
        warehouses = set() if warehouse is False else ({warehouse} if warehouse else None)
    else:
        warehouses = await branch_stock.viewing_warehouses(db, user, branch_id)
    if warehouses is not None:
        branch_stock.apply_stock(items, await branch_stock.stock_in(db, user.tenant_id, warehouses))


async def _scope_one(db, user, obj, branch_id, for_sale: bool = False) -> None:
    """The same scoping for one product or one variant (a barcode can find either)."""
    product_id = getattr(obj, "product_id", None)
    if product_id is None:
        await _scope_stock(db, user, [obj], branch_id, for_sale)
        return
    holder = type("One", (), {"id": product_id, "variants": [obj], "stock": 0})()
    await _scope_stock(db, user, [holder], branch_id, for_sale)


@router.get("/inventory/products/vat-summary")
async def vat_summary(db: DbSession, current_user: CurrentUser):
    """How many products are in each VAT treatment, including those not reviewed yet."""
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service.product import may_classify_vat, vat_review_counts
    return success_response(data={"counts": await vat_review_counts(db, current_user.tenant_id), "can_classify": may_classify_vat(current_user)})


@router.post("/inventory/products/vat-classification")
async def classify_products_vat(data: VatClassification, db: DbSession, current_user: CurrentUser):
    """Bulk VAT classification. Needs tax:update (owners and administrators always may)."""
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service.product import classify_vat
    result = await classify_vat(db, current_user.tenant_id, data, current_user)
    return success_response(data=result, message=f"{result['updated']} products classified")


@router.get("/inventory/products/low-stock")
async def low_stock_report(db: DbSession, current_user: CurrentUser, active_branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.routes.valuation import branch_levels, scoped_stock
    report = await service.low_stock_report(db, current_user.tenant_id, await scoped_stock(db, current_user, active_branch),
                                            await branch_levels(db, current_user, active_branch))
    return success_response(data=report.model_dump(), message="Low stock report retrieved successfully")


@router.get("/inventory/products/barcode/{code}")
async def get_product_by_barcode(code: str, db: DbSession, current_user: CurrentUser, active_branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_product_by_barcode(db, current_user.tenant_id, code)
    await _scope_one(db, current_user, obj, active_branch, for_sale=True)  # a scan shows what this branch holds, never another branch's
    # Branch prices: a scan in a branch that doesn't sell the product finds nothing there; one that does gets that branch's price.
    branch = await _sale_branch(db, current_user, active_branch)
    if branch is not None:
        from app.core.exceptions import NotFoundError
        from app.modules.inventory.service import branch_pricing
        product_id = getattr(obj, "product_id", None) or obj.id
        if await branch_pricing.hidden_products(db, current_user.tenant_id, branch, {product_id}):
            raise NotFoundError("Not sold in this branch")
        if getattr(obj, "product_id", None) is None:
            await branch_pricing.apply_prices(db, current_user.tenant_id, branch, [obj])
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


@router.post("/inventory/products/attach-sheet-pictures", dependencies=[Depends(require_permission("items:create"))])
async def attach_sheet_pictures(db: DbSession, current_user: CurrentUser, file: UploadFile = File(...), rows: str = Form(...)):
    """Pictures pasted into an import sheet, attached to the products just created from its rows. `rows` is JSON {sheet row: product id}."""
    _require_tenant(current_user.tenant_id)
    import json

    from app.modules.inventory.service.product_image_import import MAX_ZIP_BYTES
    from app.modules.inventory.service.product_image_import import attach_sheet_pictures as attach
    try:
        mapping = {int(row): uuid.UUID(str(pid)) for row, pid in json.loads(rows).items()}
    except (ValueError, TypeError, AttributeError) as exc:
        raise ValidationError("rows must map sheet row numbers to product ids") from exc
    content = await file.read(MAX_ZIP_BYTES + 1)
    if len(content) > MAX_ZIP_BYTES:
        raise ValidationError("The file is larger than 60MB")
    result = await attach(db, current_user.tenant_id, content, mapping)
    return success_response(data=result, message=f"{result['total_pictures']} pictures attached")


@router.post("/inventory/products/bulk")
async def bulk_create_products(data: ProductBulkCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    result = await service.bulk_create_products(db, current_user.tenant_id, data, actor=current_user)
    return success_response(data=result.model_dump(), message=f"{result.created} products created", status_code=201)


@router.get("/inventory/products/{id}")
async def get_product(id: uuid.UUID, db: DbSession, current_user: CurrentUser, active_branch: ActiveBranchId):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_product(db, current_user.tenant_id, id)
    await _scope_one(db, current_user, obj, active_branch)  # the chosen branch's stock; branch staff never see another branch's
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


# ── Stock by branch ──────────────────────────────────────────────────────────

@router.get("/inventory/branches/summary")
async def branches_summary(db: DbSession, current_user: CurrentUser, page_params: PageQuery,
                           sort: Literal["name", "value", "units", "low", "out", "incoming"] = "name", descending: bool = False):
    """Per branch: stock value at cost and retail, units, products, low, out and stock on the way in. Sortable and paginated for
    businesses with many branches. People limited to some branches get only theirs."""
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service.branch_inventory import summary
    data = await summary(db, current_user, sort=sort, descending=descending, offset=page_params.offset, limit=page_params.limit)
    return paginated_response(items=data["items"], total=data["total"], page=page_params.page, page_size=page_params.page_size,
                              message="Stock by branch retrieved", summary={k: v for k, v in data.items() if k not in ("items", "total")})


@router.get("/inventory/branches/needs-stock")
async def branches_needs_stock(db: DbSession, current_user: CurrentUser, active_branch: ActiveBranchId, limit: int = Query(50, ge=1, le=500)):
    """Products low or out in the chosen branch (or in every branch the person may see), with the branches that hold them."""
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service.branch_inventory import needs_stock
    return success_response(data=await needs_stock(db, current_user, active_branch, limit=limit), message="Products needing stock")


@router.get("/inventory/products/{id}/stock-by-branch")
async def product_stock_by_branch(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    """One product in every branch the person may see: warehouse, on hand, reorder level, status, value, last movement."""
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service.branch_inventory import product_branches
    return success_response(data=await product_branches(db, current_user, id), message="Stock by branch retrieved")


class BranchStockSettings(BaseModel):
    reorder_level: float | None = Field(default=None, ge=0, le=10_000_000)
    use_product_reorder_level: bool = False  # clear the branch's own level: the product's applies again
    is_sold: bool | None = None  # needs branch prices switched on


@router.put("/inventory/products/{id}/stock-by-branch/{branch_id}")
async def set_product_stock_by_branch(id: uuid.UUID, branch_id: uuid.UUID, data: BranchStockSettings, db: DbSession, current_user: CurrentUser):
    """A branch's own reorder level for this product, and whether it sells it. items:update, or a branch's own manager for that branch."""
    _require_tenant(current_user.tenant_id)
    from app.modules.inventory.service.branch_inventory import set_product_branch
    result = await set_product_branch(db, current_user, id, branch_id, reorder_level=data.reorder_level,
                                      clear_reorder_level=data.use_product_reorder_level, is_sold=data.is_sold)
    return success_response(data=result, message="Branch stock settings saved")
