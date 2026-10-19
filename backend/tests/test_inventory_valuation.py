"""Regression coverage for fractional stock, empty variants and consistent exports."""
import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.modules.inventory.repository.product import ProductRepository
from app.modules.inventory.service import export, valuation
from app.modules.tenants.models import Tenant


def product(**overrides):
    values = dict(  # noqa: C408
id=uuid.uuid4(), name="Bulk flour", sku=None, category=None, brand=None,
                  unit=None, has_variants=False, variants=[], cost=Decimal("12.34"),
                  price=Decimal(20), stock=Decimal("1.125"), min_stock=Decimal("0.5"))
    return SimpleNamespace(**(values | overrides))


async def test_fractional_stock_and_all_variants_aggregate_once(monkeypatch):
    variants = [SimpleNamespace(id=uuid.uuid4(), is_active=True, attributes={}, sku=None,
                               cost=Decimal(10), price=Decimal(20), stock=Decimal(q),
                               min_stock=Decimal("0.1")) for q in ("1.25", "2.75")]
    variants.append(SimpleNamespace(is_active=False))
    products = [product(), product(has_variants=True, variants=variants),
                product(has_variants=True, variants=[])]
    monkeypatch.setattr(ProductRepository, "valuation_products", AsyncMock(return_value=products))
    report = await valuation.inventory_valuation(None, uuid.uuid4())
    assert report.summary.total_units == 5.125
    assert report.summary.variant_count == 2
    assert report.summary.line_count == 3
    assert report.summary.cost_value == 53.88
    assert report.categories[0].units == report.summary.total_units
    assert report.categories[0].cost_value == report.summary.cost_value
    tenant = Tenant(name="Test business", slug="test", currency="USD")
    export._CURRENCY.set("USD")
    csv = export._export_csv(report, tenant).decode("utf-8-sig")
    assert "53.88" in csv and "5.125" in csv
    export._register_fonts()
    pdf = export._build_pdf(report, tenant, export._styles())
    assert pdf.startswith(b"%PDF-")


async def test_empty_inventory(monkeypatch):
    monkeypatch.setattr(ProductRepository, "valuation_products", AsyncMock(return_value=[]))
    report = await valuation.inventory_valuation(None, uuid.uuid4())
    assert report.summary.total_units == report.summary.cost_value == 0
    assert report.summary.margin_pct is None
    assert report.lines == report.categories == []


@pytest.mark.db
async def test_repository_isolates_tenants_and_fractional_db_values(db):
    from app.modules.inventory.models.product import Product
    tenant = Tenant(name="Valuation", slug=uuid.uuid4().hex)
    other = Tenant(name="Other", slug=uuid.uuid4().hex)
    db.add_all([tenant, other])
    await db.flush()
    db.add_all([Product(tenant_id=tenant.id, name="Fraction", stock=Decimal("0.125"), cost=8),
                Product(tenant_id=other.id, name="Private", stock=999, cost=999)])
    await db.flush()
    report = await valuation.inventory_valuation(db, tenant.id)
    assert report.summary.total_units == 0.125
    assert report.summary.cost_value == 1
    assert len(report.lines) == 1
