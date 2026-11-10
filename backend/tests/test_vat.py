"""VAT: the shared tax engine, product classification and line-level tax on sales."""
import uuid
from decimal import Decimal as D

import pytest
from sqlalchemy import select

from app.core.exceptions import ForbiddenError
from app.modules.accounting.service.tax import calculate_vat
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant
from app.modules.sales.models.order_item import OrderItem
from app.modules.tax.engine import EXCLUSIVE, INCLUSIVE, TaxLine, allocate, calculate, reverse

# ── engine ──────────────────────────────────────────────────────────────────


def test_mixed_cart_tax_exclusive_matches_the_brief():
    r = calculate([TaxLine("a", D(100000), "standard"), TaxLine("b", D(50000), "zero_rated"), TaxLine("c", D(30000), "exempt")],
                  registered=True, standard_rate=D(18), mode=EXCLUSIVE)
    assert (r.net, r.tax, r.gross) == (D(180000), D(18000), D(198000))
    assert r.breakdown["zero_rated"]["tax"] == 0 and r.breakdown["exempt"]["tax"] == 0
    assert {ln.treatment for ln in r.lines} == {"standard", "zero_rated", "exempt"}  # zero-rated and exempt stay apart


def test_tax_inclusive_price_is_split_not_increased():
    r = calculate([TaxLine("a", D(118000), "standard")], registered=True, standard_rate=D(18), mode=INCLUSIVE)
    assert (r.lines[0].taxable_base, r.lines[0].tax, r.gross) == (D(100000), D(18000), D(118000))


def test_unreviewed_products_are_priced_exactly_as_before():
    """A product nobody has classified yet behaves like every product did before line-level VAT: the same VAT,
    to the cent, as the old whole-order calculation."""
    for amounts in ([D("99.99"), D("0.01"), D("12.34")], [D(1000)], [D("33.33")] * 7):
        r = calculate([TaxLine(str(i), a, None) for i, a in enumerate(amounts)], registered=True, standard_rate=D(18))
        legacy = D(str(calculate_vat(sum(amounts), inclusive=True, rate=D(18))["vat_amount"]))
        assert r.tax == legacy and r.gross == sum(amounts)
        assert all(ln.treatment == "standard" for ln in r.lines)


def test_a_business_that_is_not_registered_charges_no_vat():
    r = calculate([TaxLine("a", D(1000), "standard"), TaxLine("b", D(500), "zero_rated")], registered=False, standard_rate=D(18), mode=EXCLUSIVE)
    assert r.tax == 0 and r.gross == D(1500)
    assert {ln.treatment for ln in r.lines} == {"not_registered"} and all(ln.tax_code is None for ln in r.lines)


def test_order_discount_is_shared_to_the_cent_and_reversal_uses_the_recorded_vat():
    shares = allocate([D(100), D(50), D(30)], D("10.01"))
    assert sum(shares) == D("10.01") and shares[0] > shares[1] > shares[2]
    base, tax = reverse(D("84.75"), D("15.25"), D(100), D(50))  # half the line comes back
    assert (base, tax) == (D("42.37"), D("7.63"))  # rounding goes to VAT, the base takes the rest


def test_invalid_input_is_refused():
    with pytest.raises(ValueError):
        calculate([TaxLine("a", D(-1), "standard")], registered=True, standard_rate=D(18))
    with pytest.raises(ValueError):
        calculate([TaxLine("a", D(1), "reduced")], registered=True, standard_rate=D(18))
    with pytest.raises(ValueError):
        allocate([D(10)], D(11))


# ── products and sales ───────────────────────────────────────────────────────


async def business(db, **tenant):
    from app.modules.tenants.models import Tenant, User
    nonce = uuid.uuid4().hex
    t = Tenant(name="VAT test", slug=f"vat-{nonce}", **tenant)
    db.add(t)
    await db.flush()
    owner = User(tenant_id=t.id, email=f"{nonce}@x.test", hashed_password="x", full_name="Owner", role="owner", is_superuser=True, is_active=True)
    db.add(owner)
    await db.flush()
    return t, owner


def item(p, price, qty=1):
    return {"product_id": p.id, "product_name": p.name, "unit_price": price, "quantity": qty}


@pytest.mark.db
async def test_mixed_vat_sale_snapshots_each_line(db):
    from app.modules.sales.schemas.order import OrderCreate
    from app.modules.sales.service.order import create_order

    tenant, owner = await business(db, vat_pricing_mode="exclusive")
    a = Product(tenant_id=tenant.id, name="Std", sku=uuid.uuid4().hex, price=100000, cost=1, stock=5, vat_treatment="standard")
    b = Product(tenant_id=tenant.id, name="Zero", sku=uuid.uuid4().hex, price=50000, cost=1, stock=5, vat_treatment="zero_rated", vat_reason="Export")
    c = Product(tenant_id=tenant.id, name="Exempt", sku=uuid.uuid4().hex, price=30000, cost=1, stock=5, vat_treatment="exempt", vat_reason="Health")
    db.add_all([a, b, c])
    await db.flush()
    order = await create_order(db, tenant.id, owner.id, OrderCreate(client_order_id=uuid.uuid4().hex, items=[item(a, 100000), item(b, 50000), item(c, 30000)]))
    assert (order.subtotal, order.tax, order.total) == (180000, 18000, 198000)
    rows = (await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))).all()
    snap = {r.product_name: (r.tax_treatment, r.tax_rate, r.tax_amount) for r in rows}
    assert snap == {"Std": ("standard", D(18), D(18000)), "Zero": ("zero_rated", D(0), D(0)), "Exempt": ("exempt", D(0), D(0))}
    # A later change to the product never rewrites the sale.
    b.vat_treatment = "standard"
    await db.flush()
    assert (await db.get(OrderItem, next(r.id for r in rows if r.product_name == "Zero"))).tax_treatment == "zero_rated"


@pytest.mark.db
async def test_inclusive_default_keeps_totals_and_spreads_order_discount_before_vat(db):
    from app.modules.sales.schemas.order import OrderCreate
    from app.modules.sales.service.order import create_order

    tenant, owner = await business(db, discount_settings={"enabled": True, "manual_pos": True})
    a = Product(tenant_id=tenant.id, name="Std", sku=uuid.uuid4().hex, price=1180, cost=1, stock=5)  # not reviewed
    b = Product(tenant_id=tenant.id, name="Exempt", sku=uuid.uuid4().hex, price=1000, cost=1, stock=5, vat_treatment="exempt", vat_reason="Education")
    db.add_all([a, b])
    await db.flush()
    order = await create_order(db, tenant.id, owner.id, OrderCreate(client_order_id=uuid.uuid4().hex, discount=218, items=[item(a, 1180), item(b, 1000)]))
    assert order.total == 1962  # inclusive: the total is still subtotal - discount
    # 218 off is shared 118 / 100, so the standard line sells for 1062 and carries 162 VAT; the exempt line none.
    assert order.tax == 162


@pytest.mark.db
async def test_variant_inherits_unless_it_overrides(db):
    from app.modules.tax.service import treatments

    tenant, _ = await business(db)
    p = Product(tenant_id=tenant.id, name="Shirt", sku=uuid.uuid4().hex, has_variants=True, vat_treatment="zero_rated", vat_reason="x", tax_code="C")
    db.add(p)
    await db.flush()
    inherit = ProductVariant(product_id=p.id, attributes={"s": "M"})
    own = ProductVariant(product_id=p.id, attributes={"s": "L"}, vat_treatment="standard")
    db.add_all([inherit, own])
    await db.flush()
    assert await treatments(db, tenant.id, [(None, inherit.id), (None, own.id), (p.id, None)]) == [("zero_rated", "C"), ("standard", "C"), ("zero_rated", "C")]


@pytest.mark.db
async def test_classification_needs_tax_permission_is_audited_and_stays_in_the_business(db):
    from types import SimpleNamespace

    from app.modules.inventory.schemas.product import VatClassification
    from app.modules.inventory.service.product import classify_vat, vat_review_counts

    tenant, owner = await business(db)
    other, _ = await business(db)
    mine = Product(tenant_id=tenant.id, name="Mine", sku=uuid.uuid4().hex)
    theirs = Product(tenant_id=other.id, name="Theirs", sku=uuid.uuid4().hex)
    db.add_all([mine, theirs])
    await db.flush()
    request = VatClassification(product_ids=[mine.id, theirs.id], vat_treatment="exempt", vat_reason="Financial services")
    clerk = SimpleNamespace(id=uuid.uuid4(), is_superuser=False, role="member", permissions_names=["items:update"])
    with pytest.raises(ForbiddenError):
        await classify_vat(db, tenant.id, request, clerk)
    result = await classify_vat(db, tenant.id, request, owner)
    assert result == {"updated": 1, "matched": 1, "not_found": 1}
    assert mine.vat_treatment == "exempt" and mine.vat_reviewed_at is not None and theirs.vat_treatment is None
    assert (await vat_review_counts(db, tenant.id)) == {"exempt": 1}
    with pytest.raises(ValueError):
        VatClassification(product_ids=[mine.id], vat_treatment="zero_rated")  # a non-standard treatment needs its reason


@pytest.mark.db
async def test_vat_report_splits_treatments_and_reconciles_to_the_ledger(db):
    from datetime import UTC, datetime

    from app.modules.accounting.service.account import seed_default_accounts
    from app.modules.sales.schemas.order import OrderCreate
    from app.modules.sales.service.order import create_order
    from app.modules.tax.report import vat_report

    tenant, owner = await business(db, vat_pricing_mode="exclusive")
    await seed_default_accounts(db, tenant.id)
    a = Product(tenant_id=tenant.id, name="Std", sku=uuid.uuid4().hex, price=100000, cost=1, stock=5, vat_treatment="standard")
    b = Product(tenant_id=tenant.id, name="Zero", sku=uuid.uuid4().hex, price=50000, cost=1, stock=5, vat_treatment="zero_rated", vat_reason="Export")
    c = Product(tenant_id=tenant.id, name="Exempt", sku=uuid.uuid4().hex, price=30000, cost=1, stock=5, vat_treatment="exempt", vat_reason="Health")
    db.add_all([a, b, c])
    await db.flush()
    await create_order(db, tenant.id, owner.id, OrderCreate(client_order_id=uuid.uuid4().hex, status="Completed", items=[item(a, 100000), item(b, 50000), item(c, 30000)]))
    today = datetime.now(UTC).date()
    report = await vat_report(db, tenant.id, today, today)
    assert report["sales"]["standard"] == {"base": "100000.00", "tax": "18000.00", "documents": 1}
    assert report["sales"]["zero_rated"]["base"] == "50000.00" and report["sales"]["exempt"]["base"] == "30000.00"
    assert report["sales"]["zero_rated"]["tax"] == "0.00" and report["sales"]["exempt"]["tax"] == "0.00"
    assert report["net_vat"] == "18000.00"
    assert report["ledger"]["vat_payable_movement"] == "18000.00" and report["ledger"]["difference"] == "0.00"
    other, _ = await business(db)
    assert (await vat_report(db, other.id, today, today))["sales"] == {}  # another business sees none of it
