"""Loads what the tax engine needs (the business's VAT registration, pricing mode and standard rate, and each product's
VAT treatment) and prices document lines. Every sales flow calls `price_lines`; nothing else computes VAT."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tax import engine


@dataclass
class TaxContext:
    registered: bool
    mode: str
    standard_rate: Decimal


async def context(db: AsyncSession, tenant_id: uuid.UUID, on: date | None = None) -> TaxContext:
    """The business's VAT position on a given day. A business is registered when VAT is switched on and, if a
    registration date is recorded, the day is on or after it."""
    from app.modules.accounting.service.tax import get_effective_vat_rate
    from app.modules.tenants.models import Tenant

    row = (await db.execute(select(Tenant.vat_enabled, Tenant.vat_registered_from, Tenant.vat_pricing_mode)
                            .where(Tenant.id == tenant_id))).one_or_none()
    if row is None:  # a lookup miss must never silently drop VAT for a real business
        return TaxContext(True, engine.INCLUSIVE, await get_effective_vat_rate(db, tenant_id))
    enabled, since, mode = row
    registered = bool(True if enabled is None else enabled) and (since is None or on is None or on >= since)
    rate = await get_effective_vat_rate(db, tenant_id) if registered else Decimal(0)
    return TaxContext(registered, mode or engine.INCLUSIVE, Decimal(str(rate)))


async def treatments(db: AsyncSession, tenant_id: uuid.UUID, items: list[tuple[uuid.UUID | None, uuid.UUID | None]]) -> list[tuple[str | None, str | None]]:
    """Each line's (treatment, tax code): a variant's own treatment if it has one, otherwise its product's.
    None = the product has not been reviewed (priced as standard). Lines without a product (free-text lines) are None too."""
    from app.modules.inventory.models.product import Product
    from app.modules.inventory.models.variant import ProductVariant

    variant_ids = {v for _, v in items if v}
    variants = {}
    if variant_ids:
        variants = {v.id: (v.product_id, v.vat_treatment) for v in (await db.execute(
            select(ProductVariant.id, ProductVariant.product_id, ProductVariant.vat_treatment).where(ProductVariant.id.in_(variant_ids)))).all()}
    product_ids = {p for p, _ in items if p} | {pid for pid, _ in variants.values()}
    products = {}
    if product_ids:
        products = {p.id: (p.vat_treatment, p.tax_code) for p in (await db.execute(
            select(Product.id, Product.vat_treatment, Product.tax_code)
            .where(Product.tenant_id == tenant_id, Product.id.in_(product_ids)))).all()}
    out: list[tuple[str | None, str | None]] = []
    for product_id, variant_id in items:
        own = None
        if variant_id and variant_id in variants:
            product_id, own = variants[variant_id]
        treatment, code = products.get(product_id, (None, None)) if product_id else (None, None)
        out.append((own or treatment, code))
    return out


async def price_lines(db: AsyncSession, tenant_id: uuid.UUID, lines: list[tuple[uuid.UUID | None, uuid.UUID | None, Decimal]],
                      order_discount: Decimal = Decimal(0), on: date | None = None) -> engine.TaxResult:
    """Tax a document: each (product, variant, line amount after line discounts), with any order-level discount spread
    over the lines first, so VAT is charged on what each line actually sells for."""
    ctx = await context(db, tenant_id, on)
    amounts = [engine.money(amount) for _, _, amount in lines]
    shares = engine.allocate(amounts, Decimal(str(order_discount))) if order_discount else [engine.ZERO] * len(amounts)
    kinds = await treatments(db, tenant_id, [(p, v) for p, v, _ in lines])
    return engine.calculate(
        [engine.TaxLine(str(i), amount - share, kind[0], kind[1]) for i, (amount, share, kind) in enumerate(zip(amounts, shares, kinds, strict=True))],
        registered=ctx.registered, standard_rate=ctx.standard_rate, mode=ctx.mode,
    )


def snapshot(item, taxed: engine.TaxedLine) -> None:
    """Freeze a line's VAT on the stored line. Called whenever a document is priced; never from product settings later."""
    item.tax_treatment = taxed.treatment
    item.tax_code = taxed.tax_code
    item.tax_rate = taxed.rate
    item.taxable_base = taxed.taxable_base
    item.tax_amount = taxed.tax
