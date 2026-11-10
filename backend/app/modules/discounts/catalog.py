"""Batch, cart-aware POS catalogue previews using the checkout pricing engine."""

from dataclasses import replace
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.discounts import engine
from app.modules.discounts.schemas import CatalogPriceIn, PriceIn, PriceItem
from app.modules.discounts.service import _lines, calculate_pricing, prepare_pricing
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.tenants.models import User


def offer_for(
    rule: engine.Rule, conditional: bool, currency: str, saving=None, original=None
) -> dict:
    if rule.type == "coupon":
        label = "COUPON OFFER"
    elif rule.type == "bogo":
        buy, get = rule.config.get("buy") or {}, rule.config.get("get") or {}
        reward = engine.D(get.get("percent", 100))
        label = (
            f"BUY {buy.get('qty', 1)} GET {get.get('qty', 1)}"
            if reward == 100
            else f"BUY {buy.get('qty', 1)} · {reward.normalize():f}% OFF {get.get('qty', 1)}"
        )
    elif rule.type in ("volume", "tiered"):
        label = "VOLUME DEAL" if rule.type == "volume" else "TIERED DEAL"
    elif conditional and saving is None:
        label = "CONDITIONAL OFFER"
    elif rule.value_kind == "percent":
        rate = (
            engine.money(saving * 100 / original) if saving is not None and original else rule.value
        )
        label = f"{rate.normalize():f}% OFF"
    else:
        label = f"SAVE {currency} {engine.money(saving if saving is not None else rule.value)}"
    descriptions = []
    conditions = rule.config.get("conditions") or {}
    if conditions.get("min_order_amount"):
        descriptions.append(f"Minimum sale: {currency} {conditions['min_order_amount']}")
    if conditions.get("min_quantity"):
        descriptions.append(f"Minimum qualifying quantity: {conditions['min_quantity']}")
    if rule.type in ("volume", "tiered"):
        for band in rule.config.get("tiers") or rule.config.get("thresholds") or []:
            descriptions.append(
                f"From {band.get('from', band.get('min_qty'))}: {band['value']}% off"
            )
    if rule.type == "coupon":
        descriptions.append("Requires a valid, applied coupon")
    if rule.type == "bogo":
        descriptions.append("Qualifying purchase and reward items must be in the cart")
    return {
        "rule_id": rule.id,
        "name": rule.name,
        "type": rule.type,
        "label": label,
        "description": "; ".join(descriptions),
        "saving": str(engine.money(saving)) if saving is not None else None,
        "conditional": conditional,
        "conditions": rule.config.get("conditions") or {},
    }


async def catalog_prices(db: AsyncSession, user: User, data: CatalogPriceIn, branch) -> dict:
    from app.modules.currency.service import get_base_currency

    tenant_id = user.tenant_id
    ids = {ref.product_id for ref in data.products}
    products = {
        row.id: row
        for row in (
            await db.scalars(
                select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(ids))
            )
        )
        .unique()
        .all()
    }
    variant_ids = {ref.variant_id for ref in data.products if ref.variant_id}
    variants = (
        {
            row.id: row
            for row in (
                await db.scalars(
                    select(ProductVariant)
                    .join(Product)
                    .where(Product.tenant_id == tenant_id, ProductVariant.id.in_(variant_ids))
                )
            )
            .unique()
            .all()
        }
        if variant_ids
        else {}
    )
    if ids != set(products):
        raise NotFoundError("A catalogue product was not found in this business")
    sample = data.cart or PriceIn(
        items=[
            PriceItem(
                product_id=ref.product_id,
                variant_id=ref.variant_id,
                unit_price=engine.D(products[ref.product_id].price),
                quantity=1,
            )
            for ref in data.products
        ],
        customer_id=data.customer_id,
    )
    # The selected customer applies to both catalogue and cart. Never accept a conflicting identity.
    sample = sample.model_copy(update={"customer_id": data.customer_id, "channel": "pos"})
    rules, ctx, _, _, config = await prepare_pricing(db, user, sample, branch, lock_coupons=False)
    base_lines = await _lines(db, tenant_id, sample) if data.cart else []
    # Manual discounts belong to the existing sale, never to hypothetical catalogue additions.
    already_applied = calculate_pricing(base_lines, rules, ctx).applied if base_lines else []
    active_coupon_rules = {item.rule_id for item in already_applied if item.kind == "coupon"}
    display_ctx = replace(
        ctx,
        manual=None,
        legacy_manual_lines={},
        manual_allowed=False,
        valid_coupons={
            key: value for key, value in ctx.valid_coupons.items() if key in active_coupon_rules
        },
    )
    currency = await get_base_currency(db, tenant_id)
    expires = [ctx.now + timedelta(seconds=15)] + [
        value
        for rule in rules
        for value in (rule.starts_at, rule.ends_at)
        if value and value > ctx.now
    ]
    rows = []
    for ref in data.products:
        product = products[ref.product_id]
        variant = variants.get(ref.variant_id) if ref.variant_id else None
        if ref.variant_id and (not variant or variant.product_id != ref.product_id):
            raise NotFoundError("A catalogue variant was not found in this business")
        catalog_price = engine.D(variant.price if variant else product.price)
        cost = engine.D(variant.cost if variant else product.cost)
        candidate = engine.Line(
            "catalog",
            catalog_price,
            engine.D(1),
            product_id=str(product.id),
            category_id=str(product.category_id) if product.category_id else None,
            cost=cost,
            variant_id=str(variant.id) if variant else None,
        )
        match = next(
            (
                line
                for line in base_lines
                if line.product_id == candidate.product_id
                and line.variant_id == candidate.variant_id
            ),
            None,
        )
        lines = base_lines if match else [*base_lines, candidate]
        target = match or candidate
        priced = calculate_pricing(lines, rules, display_ctx)
        line_result = next(line for line in priced.lines if line["ref"] == target.ref)
        discount = engine.D(line_result["discount"])
        net_unit = engine.money(engine.D(line_result["net"]) / target.qty)
        applied = [applied for applied in priced.applied if applied.lines.get(target.ref, 0) > 0]
        offers = []
        if config["enabled"]:
            for rule in rules:
                conditions = rule.config.get("conditions") or {}
                # The same eligibility evaluator filters customer, branch, channel, dates and item scope.
                relaxed = replace(
                    rule,
                    config={
                        **rule.config,
                        "conditions": {
                            k: v
                            for k, v in conditions.items()
                            if k not in ("min_order_amount", "min_quantity")
                        },
                    },
                )
                offer_ctx = (
                    replace(
                        display_ctx, valid_coupons={**display_ctx.valid_coupons, rule.id: "preview"}
                    )
                    if rule.type == "coupon"
                    else display_ctx
                )
                if rule.type == "bogo" and not any(
                    engine._pool([candidate], rule.config.get(key) or {}, rule)
                    for key in ("buy", "get")
                ):
                    continue
                if rule.type == "bogo":
                    # Pool membership already validates buy/reward targets; keep customer/branch/date guards.
                    scope = {
                        key: value
                        for key, value in (relaxed.config.get("scope") or {}).items()
                        if key not in ("product_ids", "category_ids", "variant_ids")
                    }
                    relaxed = replace(relaxed, config={**relaxed.config, "scope": scope})
                if engine.eligibility(relaxed, [candidate], offer_ctx, candidate.gross) is None:
                    is_applied = any(item.rule_id == rule.id for item in applied)
                    conditional = (
                        bool(priced.blocked)
                        or not is_applied
                        or rule.type in ("bogo", "volume", "tiered", "coupon", "order")
                        or bool(conditions)
                    )
                    grant = next(
                        (
                            item.lines.get(target.ref, engine.D(0)) / target.qty
                            for item in applied
                            if item.rule_id == rule.id
                        ),
                        None,
                    )
                    offers.append(
                        offer_for(
                            rule,
                            conditional,
                            currency,
                            None if priced.blocked else grant,
                            target.unit_price,
                        )
                    )
        # Sort actual savings ahead of conditional offers; never advertise below-cost/blocked prices.
        active_ids = {item.rule_id for item in applied}
        offers.sort(key=lambda offer: (offer["rule_id"] not in active_ids, offer["conditional"]))
        safe = not priced.blocked and discount > 0 and net_unit >= cost
        rows.append(
            {
                "product_id": str(product.id),
                "variant_id": str(variant.id) if variant else None,
                "original_unit_price": str(engine.money(target.unit_price)),
                "unit_price": str(engine.money(net_unit if safe else target.unit_price)),
                "savings": str(engine.money(discount / target.qty) if safe else engine.D(0)),
                "offers": offers,
                "quantity": str(target.qty),
                "price_context": "Current cart before manual discounts"
                if match
                else "Preview with one unit added, before manual discounts",
                "blocked": priced.blocked,
                "price_approximate": safe and net_unit != engine.D(line_result["net"]) / target.qty,
            }
        )
    return {
        "items": rows,
        "currency": currency,
        "evaluated_at": ctx.now.isoformat(),
        "valid_until": min(expires).isoformat(),
    }
