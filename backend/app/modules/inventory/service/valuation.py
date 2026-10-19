import uuid
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.inventory.repository import ProductRepository
from app.modules.inventory.schemas.valuation import (
    CategoryValuation,
    InventoryValuationReport,
    ValuationLine,
    ValuationSummary,
)


def _status(stock: Decimal, min_stock: Decimal) -> str:
    if stock <= 0:
        return "out"
    if stock <= min_stock:
        return "low"
    return "ok"


def _margin_pct(margin: float, retail_value: float) -> float | None:
    if retail_value <= 0:
        return None
    return round(margin / retail_value * 100, 1)


async def inventory_valuation(db: AsyncSession, tenant_id: uuid.UUID) -> InventoryValuationReport:
    products = await ProductRepository(db).valuation_products(tenant_id)

    lines: list[ValuationLine] = []
    by_cat: dict[str, dict] = {}
    variant_count = 0

    for product in products:
        cat_name = product.category.name if product.category else None
        if product.has_variants:
            for v in product.variants:
                if not v.is_active:
                    continue
                variant_count += 1
                cost = Decimal(str(v.cost or 0))
                price = Decimal(str(v.price or 0))
                stock = Decimal(str(v.stock or 0))
                cost_value = (cost * stock).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                retail_value = (price * stock).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                margin = round(retail_value - cost_value, 2)
                lines.append(ValuationLine(
                    id=v.id,
                    product_id=product.id,
                    kind="variant",
                    name=f"{product.name} — {', '.join(f'{k}: {val}' for k, val in v.attributes.items()) if v.attributes else 'Default'}",
                    sku=v.sku or product.sku,
                    category=cat_name,
                    brand=product.brand.name if product.brand else None,
                    unit=product.unit.abbreviation if product.unit else None,
                    stock=stock,
                    min_stock=v.min_stock or 0,
                    cost=cost,
                    price=price,
                    cost_value=cost_value,
                    retail_value=retail_value,
                    margin=margin,
                    margin_pct=_margin_pct(margin, retail_value),
                    status=_status(stock, v.min_stock or 0),
                ))
        else:
            cost = Decimal(str(product.cost or 0))
            price = Decimal(str(product.price or 0))
            stock = Decimal(str(product.stock or 0))
            cost_value = (cost * stock).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            retail_value = (price * stock).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            margin = round(retail_value - cost_value, 2)
            lines.append(ValuationLine(
                id=product.id,
                product_id=product.id,
                kind="product",
                name=product.name,
                sku=product.sku,
                category=cat_name,
                brand=product.brand.name if product.brand else None,
                unit=product.unit.abbreviation if product.unit else None,
                stock=stock,
                min_stock=product.min_stock or 0,
                cost=cost,
                price=price,
                cost_value=cost_value,
                retail_value=retail_value,
                margin=margin,
                margin_pct=_margin_pct(margin, retail_value),
                status=_status(stock, product.min_stock or 0),
            ))

    # Aggregate every emitted line, including every active variant, exactly once.
    for line in lines:
        key = line.category or "Uncategorized"
        bucket = by_cat.setdefault(key, {
            "name": key, "units": Decimal(0), "cost_value": Decimal(0),
            "retail_value": Decimal(0), "margin": Decimal(0),
        })
        for field, value in (("units", line.stock), ("cost_value", line.cost_value),
                             ("retail_value", line.retail_value), ("margin", line.margin)):
            bucket[field] += Decimal(str(value))

    categories = [
        CategoryValuation(**b)
        for b in sorted(by_cat.values(), key=lambda b: b["cost_value"], reverse=True)
    ]

    total_units = sum((Decimal(str(line.stock)) for line in lines), Decimal(0))
    cost_value = round(sum((Decimal(str(line.cost_value)) for line in lines), Decimal(0)), 2)
    retail_value = round(sum((Decimal(str(line.retail_value)) for line in lines), Decimal(0)), 2)
    margin = round(sum((Decimal(str(line.margin)) for line in lines), Decimal(0)), 2)

    summary = ValuationSummary(
        product_count=len(products),
        line_count=len(lines),
        variant_count=variant_count,
        total_units=total_units,
        cost_value=cost_value,
        retail_value=retail_value,
        margin=margin,
        margin_pct=_margin_pct(margin, retail_value),
        low_stock_count=sum(1 for l in lines if l.status == "low"),
        out_of_stock_count=sum(1 for l in lines if l.status == "out"),
    )

    return InventoryValuationReport(
        generated_at=datetime.now(UTC).isoformat(),
        costing_method="unit_cost",
        summary=summary,
        categories=categories,
        lines=sorted(lines, key=lambda l: l.cost_value, reverse=True),
    )
