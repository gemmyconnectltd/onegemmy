import uuid

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.integrations.storage import storage
from app.modules.inventory.models.product import Product
from app.modules.inventory.repository import ProductRepository, VariantRepository
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


async def get_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    return ProductRead.model_validate(obj)


async def list_products(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20,
                        search: str | None = None) -> list[ProductRead]:
    items = await ProductRepository(db).list_for_tenant(tenant_id, offset, limit, search)
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


async def count_products(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await ProductRepository(db).count_for_tenant(tenant_id)


async def create_product(db: AsyncSession, tenant_id: uuid.UUID, data: ProductCreate) -> ProductRead:
    obj = Product(tenant_id=tenant_id, **data.model_dump())
    obj = await ProductRepository(db).save(obj)
    await db.commit()
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return ProductRead.model_validate(obj)


async def bulk_create_products(db: AsyncSession, tenant_id: uuid.UUID, data: ProductBulkCreate) -> ProductBulkResult:
    repo = ProductRepository(db)
    created = 0
    errors: list[str] = []
    for item in data.items:
        try:
            obj = Product(tenant_id=tenant_id, **item.model_dump())
            await repo.save(obj)
            created += 1
        except SQLAlchemyError as e:
            await db.rollback()
            errors.append(f"{item.name or item.sku}: {e!s}")
    if created > 0:
        await db.commit()
    return ProductBulkResult(created=created, failed=len(errors), errors=errors)


async def update_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ProductUpdate) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await ProductRepository(db).save(obj)
    await db.commit()
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    return ProductRead.model_validate(obj)


async def delete_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if obj.image_url:
        await storage.delete(obj.image_url)
    await ProductRepository(db).delete(obj)
    await db.commit()


async def upload_product_image(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, filename: str, content: bytes) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if obj.image_url:
        await storage.delete(obj.image_url)
    url = await storage.save("products", filename, content)
    obj.image_url = url
    obj = await ProductRepository(db).save(obj)
    await db.commit()
    return ProductRead.model_validate(obj)


async def delete_product_image(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if obj.image_url:
        await storage.delete(obj.image_url)
        obj.image_url = None
        obj = await ProductRepository(db).save(obj)
        await db.commit()
    return ProductRead.model_validate(obj)


async def restock_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: RestockRequest) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if data.mode == "adjust":
        obj.stock = data.qty
    else:
        obj.stock = obj.stock + data.qty
    obj = await ProductRepository(db).save(obj)
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
