import uuid
from decimal import Decimal

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.period import DatePeriod
from app.core.stock_context import set_reason
from app.integrations.storage import storage
from app.modules.inventory.data.product_defaults import default_product_image
from app.modules.inventory.models.batch import InventoryBatch
from app.modules.inventory.models.product import Product
from app.modules.inventory.repository import BatchRepository, ProductRepository, VariantRepository
from app.modules.inventory.schemas import (
    LowStockLine,
    LowStockReport,
    ProductBulkCreate,
    ProductBulkResult,
    ProductCreate,
    ProductRead,
    ProductUpdate,
    RestockRequest,
    VariantListRead,
)
from app.modules.tenants.models import User
from app.modules.tenants.repository import TenantRepository


def _is_uploaded_file(url: str) -> bool:
    """True for a real tenant-uploaded file under /uploads — false for a
    bundled default image (/static/...), which storage.delete() must never
    be pointed at."""
    return url.startswith("/uploads/")


async def _tenant_industry(db: AsyncSession, tenant_id: uuid.UUID) -> str | None:
    tenant = await TenantRepository(db).get(tenant_id)
    return tenant.industry if tenant else None


async def get_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    return ProductRead.model_validate(obj)


async def list_products(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20,
                        search: str | None = None, is_active: bool | None = None, period: DatePeriod | None = None) -> list[ProductRead]:
    items = await ProductRepository(db).list_for_tenant(tenant_id, offset, limit, search, is_active, period)
    return [ProductRead.model_validate(i) for i in items]


async def get_product_by_barcode(db: AsyncSession, tenant_id: uuid.UUID, barcode: str) -> ProductRead | VariantListRead:
    """Resolve a scanned barcode to a product or variant (variant wins when both match)."""
    variant = await VariantRepository(db).get_by_barcode_for_tenant(tenant_id, barcode)
    if variant is not None:
        read = VariantListRead.model_validate(variant)
        read.product_name = variant.product.name if variant.product else None
        read.product_sku = variant.product.sku if variant.product else None
        return read
    product = await ProductRepository(db).get_by_barcode(tenant_id, barcode)
    if product is not None:
        return ProductRead.model_validate(product)
    raise NotFoundError("No product found for this barcode")


async def count_products(db: AsyncSession, tenant_id: uuid.UUID, search: str | None = None, is_active: bool | None = None, period: DatePeriod | None = None) -> int:
    return await ProductRepository(db).count_for_tenant(tenant_id, search, is_active, period)


def _product_with_sku(tenant_id: uuid.UUID, payload: dict[str, object]) -> Product:
    """Use the product UUID for generated SKUs, including bulk imports."""
    product_id = uuid.uuid4()
    if not payload.get("sku"):
        payload["sku"] = f"PRD-{product_id.hex.upper()}"
    return Product(id=product_id, tenant_id=tenant_id, **payload)


async def create_product(db: AsyncSession, tenant_id: uuid.UUID, data: ProductCreate, actor: User | None = None) -> ProductRead:
    from app.modules.tenants import service

    await service.enforce_limit(db, tenant_id, "max_products", await count_products(db, tenant_id), noun="product")
    payload = data.model_dump()
    if not payload.get("image_url"):
        payload["image_url"] = default_product_image(await _tenant_industry(db, tenant_id))
    obj = _product_with_sku(tenant_id, payload)
    obj = await ProductRepository(db).save(obj)
    await record_product_change(db, obj, "product.created", {}, data.model_dump(), actor)
    await db.commit()
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return ProductRead.model_validate(obj)


async def bulk_create_products(db: AsyncSession, tenant_id: uuid.UUID, data: ProductBulkCreate, actor: User | None = None) -> ProductBulkResult:
    repo = ProductRepository(db)
    batch_repo = BatchRepository(db)
    default_image = default_product_image(await _tenant_industry(db, tenant_id))
    created = 0
    errors: list[str] = []
    for item in data.items:
        try:
            async with db.begin_nested():
                payload = item.model_dump(exclude={"batch_number", "expiry_date", "manufactured_date"})
                if not payload.get("image_url"):
                    payload["image_url"] = default_image
                obj = _product_with_sku(tenant_id, payload)
                obj = await repo.save(obj)
                await record_product_change(db, obj, "product.created", {}, payload, actor)

                if item.batch_number:
                    if await batch_repo.get_by_batch_number(tenant_id, item.batch_number):
                        raise ValidationError(f"Batch number '{item.batch_number}' already exists")
                    batch = InventoryBatch(
                        tenant_id=tenant_id,
                        product_id=obj.id,
                        batch_number=item.batch_number,
                        quantity=item.stock,
                        quantity_remaining=item.stock,
                        unit_cost=item.cost,
                        manufactured_date=item.manufactured_date,
                        expiry_date=item.expiry_date,
                    )
                    await batch_repo.save(batch)

            created += 1
        except (SQLAlchemyError, ValidationError) as e:
            errors.append(f"{item.name or item.sku}: {e!s}")
    if created > 0:
        await db.commit()
    return ProductBulkResult(created=created, failed=len(errors), errors=errors)


async def update_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ProductUpdate, can_approve: bool = True, actor: User | None = None) -> ProductRead:
    await ProductRepository(db).lock_stock(tenant_id, {id}, set())
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    updates = data.model_dump(exclude_unset=True)
    from app.modules.approvals.service import exempt_fields, guard_direct_change
    guard_direct_change({"price": obj.price, "promo_price": obj.promo_price, "stock": obj.stock}, updates, can_approve,
                        {"price": "the selling price", "promo_price": "the promotional price", "stock": "the stock quantity"},
                        await exempt_fields(db, tenant_id))
    if "image_url" in updates and not updates["image_url"]:
        updates["image_url"] = default_product_image(await _tenant_industry(db, tenant_id))
    if "sku" in updates and not updates["sku"]:
        updates["sku"] = obj.sku or f"PRD-{obj.id.hex.upper()}"
    before = {field: getattr(obj, field) for field in updates}
    for field, value in updates.items():
        setattr(obj, field, value)
    obj = await ProductRepository(db).save(obj)
    await record_product_change(db, obj, "product.updated", before, updates, actor)
    await db.commit()
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    return ProductRead.model_validate(obj)


async def delete_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if obj.image_url and _is_uploaded_file(obj.image_url):
        await storage.delete(obj.image_url)
    await ProductRepository(db).delete(obj)
    await db.commit()


async def upload_product_image(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, filename: str, content: bytes, actor: User | None = None) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    before = {"image_url": obj.image_url}
    if obj.image_url and _is_uploaded_file(obj.image_url):
        await storage.delete(obj.image_url)
    url = await storage.save("products", filename, content)
    obj.image_url = url
    obj = await ProductRepository(db).save(obj)
    await record_product_change(db, obj, "product.updated", before, {"image_url": obj.image_url}, actor)
    await db.commit()
    return ProductRead.model_validate(obj)


async def delete_product_image(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, actor: User | None = None) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    before = {"image_url": obj.image_url}
    if obj.image_url and _is_uploaded_file(obj.image_url):
        await storage.delete(obj.image_url)
    obj.image_url = default_product_image(await _tenant_industry(db, tenant_id))
    obj = await ProductRepository(db).save(obj)
    await record_product_change(db, obj, "product.updated", before, {"image_url": obj.image_url}, actor)
    await db.commit()
    return ProductRead.model_validate(obj)


async def post_stock_value_change(
    db: AsyncSession, tenant_id: uuid.UUID, actor: User | None, name: str, quantity_change: Decimal, unit_cost, reason: str | None,
) -> None:
    """A manual stock count or restock changes what the business owns, so the ledger moves with the quantity:
    stock found debits Inventory, stock lost credits it, against Inventory Adjustment, at the item's cost."""
    from app.modules.accounting.service.transaction import create_stock_adjustment_transaction
    value = (quantity_change * Decimal(str(unit_cost or 0))).quantize(Decimal("0.01"))
    await create_stock_adjustment_transaction(
        db, tenant_id, actor.id if actor else None, value,
        f"Stock {'increase' if quantity_change > 0 else 'decrease'}: {name}" + (f" ({reason})" if reason else ""),
        f"stk:{uuid.uuid4().hex}")


async def restock_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: RestockRequest, actor: User | None = None) -> ProductRead:
    await ProductRepository(db).lock_stock(tenant_id, {id}, set())
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    before = {"stock": obj.stock}
    set_reason("adjustment" if data.mode == "adjust" else "receipt", reference_type="product", reference_id=obj.id)
    if data.mode == "adjust":
        obj.stock = Decimal(str(data.qty))
    else:
        obj.stock = Decimal(str(obj.stock)) + Decimal(str(data.qty))
    obj = await ProductRepository(db).save(obj)
    await post_stock_value_change(db, tenant_id, actor, obj.name, Decimal(str(obj.stock)) - Decimal(str(before["stock"])), obj.cost, data.reason)
    await record_product_change(db, obj, "product.adjusted" if data.mode == "adjust" else "product.restocked", before, {"stock": obj.stock}, actor, reason=data.reason, notes=data.notes)
    await db.commit()
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    return ProductRead.model_validate(obj)


def _suggested(min_stock: float, stock: float) -> float:
    """Reorder in multiples of the conversion factor, capped at restoring min_stock+1x factor."""
    if stock >= min_stock:
        return 0.0
    return round(min_stock - stock, 3)


async def low_stock_report(db: AsyncSession, tenant_id: uuid.UUID) -> LowStockReport:
    """Products and variants at/below their reorder point, with suggested order qty."""
    product_repo = ProductRepository(db)
    variant_repo = VariantRepository(db)
    products = await product_repo.list_low_stock(tenant_id, 0, 500)
    variants = await variant_repo.list_low_stock_for_tenant(tenant_id, 0, 500)

    lines: list[LowStockLine] = []
    for p in products:
        if p.has_variants:
            continue
        lines.append(LowStockLine(
            id=p.id, kind="product", product_id=p.id, name=p.name, sku=p.sku,
            barcode=p.barcode, stock=float(p.stock), min_stock=float(p.min_stock),
            suggested_qty=_suggested(float(p.min_stock), float(p.stock)),
        ))
    for v in variants:
        product = v.product
        label = f"{product.name} · {', '.join(f'{k}: {val}' for k, val in (v.attributes or {}).items())}" if product else "Variant"
        lines.append(LowStockLine(
            id=v.id, kind="variant", product_id=v.product_id, variant_id=v.id,
            name=label, sku=v.sku or (product.sku if product else None),
            barcode=v.barcode, stock=float(v.stock), min_stock=float(v.min_stock),
            suggested_qty=_suggested(float(v.min_stock), float(v.stock)),
        ))

    lines.sort(key=lambda l: l.name)
    total = await product_repo.count_low_stock(tenant_id) + await variant_repo.count_low_stock_for_tenant(tenant_id)
    return LowStockReport(items=lines[:500], total=total)


async def record_product_change(db: AsyncSession, product: Product, action: str,
                                before: dict[str, object], after: dict[str, object], actor: User | None = None, **metadata: object) -> None:
    """Append audit values atomically; this function never posts stock."""
    from fastapi.encoders import jsonable_encoder

    from app.modules.audit.service import record_audit
    def same(key: str) -> bool:
        old, new = before.get(key), after[key]
        if old is not None and new is not None and key in {"price", "cost", "stock", "min_stock", "promo_price", "conversion_factor"}:
            return Decimal(str(old)) == Decimal(str(new))
        return old == new
    changed = {key for key in after if not same(key)}
    if not changed and action != "product.created":
        return
    groups = [("product.price", changed & {"price", "cost", "promo_price"}),
              (action, changed - {"price", "cost", "promo_price"})]
    if action == "product.created":
        groups = [(action, changed)]
    for event, keys in groups:
        if not keys and action != "product.created":
            continue
        if "stock" in keys and event == "product.updated":
            event = "product.adjusted"
        await record_audit(db, tenant_id=product.tenant_id,
            actor_user_id=getattr(actor, "id", None) or metadata.get("actor_id"),
            actor_name=getattr(actor, "full_name", None) or metadata.get("actor_name"),
            action=event, entity_type="product", entity_id=str(product.id),
            summary=f"{event.replace('product.', '').capitalize()}: {product.name}",
            changes=jsonable_encoder({"before": {k: before[k] for k in keys if k in before},
                                      "after": {k: after[k] for k in keys}, **metadata}, custom_encoder={Decimal: str}))
