import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.inventory.repository import ProductRepository
from app.modules.inventory.schemas.valuation import (
    CategoryValuation,
    InventoryValuationReport,
    ValuationLine,
    ValuationSummary,
)


def _status(stock: int, min_stock: int) -> str:
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
    products = await ProductRepository(db).list_for_tenant(tenant_id, 0, 100_000)

    lines: list[ValuationLine] = []
    by_cat: dict[str, dict] = {}
    variant_count = 0

    for product in products:
        cat_name = product.category.name if product.category else None
        if product.has_variants and product.variants:
            for v in product.variants:
                if not v.is_active:
                    continue
                variant_count += 1
                cost = float(v.cost)
                price = float(v.price)
                stock = v.stock
                cost_value = round(cost * stock, 2)
                retail_value = round(price * stock, 2)
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
                    min_stock=v.min_stock,
                    cost=cost,
                    price=price,
                    cost_value=cost_value,
                    retail_value=retail_value,
                    margin=margin,
                    margin_pct=_margin_pct(margin, retail_value),
                    status=_status(stock, v.min_stock),
                ))
        else:
            cost = float(product.cost)
            price = float(product.price)
            stock = product.stock
            cost_value = round(cost * stock, 2)
            retail_value = round(price * stock, 2)
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
                min_stock=product.min_stock,
                cost=cost,
                price=price,
                cost_value=cost_value,
                retail_value=retail_value,
                margin=margin,
                margin_pct=_margin_pct(margin, retail_value),
                status=_status(stock, product.min_stock),
            ))

        key = cat_name or "Uncategorized"
        bucket = by_cat.setdefault(key, {"name": key, "units": 0, "cost_value": 0.0, "retail_value": 0.0, "margin": 0.0})
        bucket["units"] += stock
        bucket["cost_value"] = round(bucket["cost_value"] + cost_value, 2)
        bucket["retail_value"] = round(bucket["retail_value"] + retail_value, 2)
        bucket["margin"] = round(bucket["margin"] + margin, 2)

    categories = [
        CategoryValuation(**b)
        for b in sorted(by_cat.values(), key=lambda b: b["cost_value"], reverse=True)
    ]

    total_units = sum(l.stock for l in lines)
    cost_value = round(sum(l.cost_value for l in lines), 2)
    retail_value = round(sum(l.retail_value for l in lines), 2)
    margin = round(sum(l.margin for l in lines), 2)

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
