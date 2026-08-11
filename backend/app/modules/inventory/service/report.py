import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.inventory.schemas import (
    MarkdownLine,
    MarkdownReport,
    SizeSelloutLine,
    SizeSelloutReport,
)
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem


async def size_sellout(
    db: AsyncSession, tenant_id: uuid.UUID, product_id: uuid.UUID | None = None, attribute_key: str = "Size"
) -> SizeSelloutReport:
    """Units sold per attribute value (e.g. per clothing/shoe size) from Completed orders."""
    stmt = (
        select(OrderItem.variant_id, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.tenant_id == tenant_id, Order.status == "Completed", OrderItem.variant_id.isnot(None))
        .group_by(OrderItem.variant_id)
    )
    result = await db.execute(stmt)
    rows = {variant_id: (float(qty), float(revenue)) for variant_id, qty, revenue in result.all()}
    if not rows:
        return SizeSelloutReport(attribute_key=attribute_key)

    variant_ids = list(rows.keys())
    variant_stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(variant_ids))
    )
    if product_id:
        variant_stmt = variant_stmt.where(ProductVariant.product_id == product_id)
    variants = (await db.execute(variant_stmt)).scalars().all()

    by_size: dict[str, list[float]] = {}
    for v in variants:
        if product_id and v.product_id != product_id:
            continue
        size = (v.attributes or {}).get(attribute_key, "N/A")
        qty, revenue = rows.get(v.id, (0.0, 0.0))
        bucket = by_size.setdefault(size, [0.0, 0.0])
        bucket[0] += qty
        bucket[1] += revenue

    items = [
        SizeSelloutLine(size=size, qty_sold=round(qty, 3), revenue=round(revenue, 2))
        for size, (qty, revenue) in sorted(by_size.items())
    ]
    return SizeSelloutReport(attribute_key=attribute_key, items=items)


async def active_markdowns(db: AsyncSession, tenant_id: uuid.UUID) -> MarkdownReport:
    """All products/variants with an active promo price."""
    now = datetime.now(UTC)
    lines: list[MarkdownLine] = []

    product_result = await db.execute(
        select(Product).where(
            Product.tenant_id == tenant_id,
            Product.promo_price.isnot(None),
            (Product.promo_ends_at.is_(None)) | (Product.promo_ends_at >= now),
        )
    )
    for p in product_result.scalars().all():
        lines.append(MarkdownLine(
            id=p.id, kind="product", product_id=p.id, name=p.name, sku=p.sku,
            barcode=p.barcode, price=float(p.price), promo_price=float(p.promo_price),
            promo_ends_at=p.promo_ends_at, savings=round(float(p.price) - float(p.promo_price), 2),
        ))

    variant_result = await db.execute(
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(
            Product.tenant_id == tenant_id,
            ProductVariant.promo_price.isnot(None),
            (ProductVariant.promo_ends_at.is_(None)) | (ProductVariant.promo_ends_at >= now),
        )
    )
    for v in variant_result.scalars().all():
        label = (
            f"{v.product.name} · {', '.join(f'{k}: {val}' for k, val in (v.attributes or {}).items())}"
            if v.product else "Variant"
        )
        lines.append(MarkdownLine(
            id=v.id, kind="variant", product_id=v.product_id, variant_id=v.id, name=label,
            sku=v.sku, barcode=v.barcode, price=float(v.price), promo_price=float(v.promo_price),
            promo_ends_at=v.promo_ends_at, savings=round(float(v.price) - float(v.promo_price), 2),
        ))

    lines.sort(key=lambda l: l.savings, reverse=True)
    return MarkdownReport(items=lines, total=len(lines))
