"""Safe catalogue previews: prices, conditions, identity, expiry and checkout agreement."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from test_discount_checkout import setup

from app.core.exceptions import NotFoundError
from app.modules.discounts.catalog import catalog_prices
from app.modules.discounts.models import DiscountRule
from app.modules.discounts.schemas import CatalogPriceIn, PriceIn
from app.modules.discounts.service import quote
from app.modules.sales.models.customer import Customer

pytestmark = pytest.mark.db


async def add_rule(db, tenant, type="percentage", value=10, **kwargs):
    rule = DiscountRule(
        tenant_id=tenant.id,
        name="Offer",
        code=f"OFFER-{type}",
        type=type,
        status="Active",
        value_kind=kwargs.pop("value_kind", "percent"),
        value=Decimal(value),
        config=kwargs.pop("config", {}),
        **kwargs,
    )
    db.add(rule)
    await db.flush()
    return rule


def request(product, **kwargs):
    return CatalogPriceIn(products=[{"product_id": product.id}], **kwargs)


async def test_regular_product_and_percentage_price_agree_with_checkout(db):
    tenant, user, product = await setup(db)
    normal = await catalog_prices(db, user, request(product), None)
    assert normal["items"][0]["unit_price"] == "100.00"
    assert normal["items"][0]["offers"] == []
    await add_rule(db, tenant)
    result = await catalog_prices(db, user, request(product), None)
    assert result["items"][0]["unit_price"] == "90.00"
    assert result["items"][0]["offers"][0]["label"] == "10% OFF"
    cart = PriceIn(items=[{"product_id": product.id, "unit_price": 100, "quantity": 1}])
    priced, *_ = await quote(db, user, cart, None)
    assert Decimal(result["items"][0]["unit_price"]) == priced.net_subtotal


async def test_fixed_reward_shows_actual_unit_savings_and_cart_allocation(db):
    tenant, user, product = await setup(db)
    await add_rule(db, tenant, type="fixed", value=20, value_kind="fixed")
    result = await catalog_prices(
        db,
        user,
        request(
            product,
            cart=PriceIn(items=[{"product_id": product.id, "unit_price": 100, "quantity": 2}]),
        ),
        None,
    )
    row = result["items"][0]
    assert row["unit_price"] == "90.00" and row["savings"] == "10.00"
    assert row["offers"][0]["label"].endswith("10.00")


@pytest.mark.parametrize(
    "type,config,label",
    [
        ("bogo", {"buy": {"qty": 2}, "get": {"qty": 1}}, "BUY 2 GET 1"),
        ("volume", {"tiers": [{"from": 5, "value": 10}]}, "VOLUME DEAL"),
        ("tiered", {"tiers": [{"from": 5, "value": 10}]}, "TIERED DEAL"),
        ("coupon", {}, "COUPON OFFER"),
    ],
)
async def test_conditional_offers_do_not_claim_single_unit_savings(db, type, config, label):
    tenant, user, product = await setup(db)
    await add_rule(db, tenant, type=type, config=config)
    result = await catalog_prices(db, user, request(product), None)
    row = result["items"][0]
    assert row["unit_price"] == "100.00"
    assert row["offers"][0]["label"] == label and row["offers"][0]["conditional"]


async def test_customer_and_branch_restrictions_do_not_leak_prices(db):
    tenant, user, product = await setup(db)
    customer = Customer(tenant_id=tenant.id, name="Eligible", customer_type="business")
    db.add(customer)
    await db.flush()
    await add_rule(
        db,
        tenant,
        type="customer",
        config={"scope": {"customer_ids": [str(customer.id)], "branch_ids": ["branch-one"]}},
    )
    walk_in = await catalog_prices(db, user, request(product), "branch-one")
    assert walk_in["items"][0]["offers"] == []
    wrong_branch = await catalog_prices(
        db, user, request(product, customer_id=customer.id), "branch-two"
    )
    assert wrong_branch["items"][0]["offers"] == []
    eligible = await catalog_prices(
        db, user, request(product, customer_id=customer.id), "branch-one"
    )
    assert eligible["items"][0]["unit_price"] == "90.00"


async def test_expired_disabled_automatic_and_disabled_module_show_regular_prices(db):
    tenant, user, product = await setup(db)
    rule = await add_rule(db, tenant, ends_at=datetime.now(UTC) - timedelta(seconds=1))
    expired = await catalog_prices(db, user, request(product), None)
    assert expired["items"][0]["offers"] == []
    rule.ends_at = None
    tenant.discount_settings = {"enabled": True, "automatic": False}
    await db.flush()
    automatic_off = await catalog_prices(db, user, request(product), None)
    assert automatic_off["items"][0]["offers"] == []
    # There is no master "off" switch any more: an old saved {"enabled": false} is ignored while the module is on.
    # Switching discounts off is done with the module itself, which closes the whole discounts API (feature gate).
    tenant.discount_settings = {"enabled": False}
    await db.flush()
    still_on = await catalog_prices(db, user, request(product), None)
    assert still_on["items"][0]["unit_price"] == "90.00"


async def test_foreign_products_are_rejected_and_preview_does_not_mutate_stock(db):
    _tenant, user, product = await setup(db)
    _other_tenant, _other_user, foreign = await setup(db)
    with pytest.raises(NotFoundError):
        await catalog_prices(db, user, request(foreign), None)
    await catalog_prices(db, user, request(product), None)
    await db.refresh(product)
    assert product.stock == 10


async def test_large_batch_uses_constant_database_reads(db):
    from sqlalchemy import event

    from app.modules.inventory.models.product import Product

    tenant, user, product = await setup(db)
    await add_rule(db, tenant)
    products = [
        Product(
            tenant_id=tenant.id,
            name=f"Item {index}",
            sku=f"BATCH-{index}",
            price=100,
            cost=40,
            stock=10,
        )
        for index in range(30)
    ]
    db.add_all(products)
    await db.flush()
    reads = []

    def track(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            reads.append(1)

    bind = db.sync_session.get_bind().engine
    event.listen(bind, "before_cursor_execute", track)
    try:
        await catalog_prices(db, user, request(product), None)
        single_count = len(reads)
        reads.clear()
        result = await catalog_prices(
            db, user, CatalogPriceIn(products=[{"product_id": item.id} for item in products]), None
        )
        assert len(result["items"]) == 30
        assert len(reads) <= single_count + 3
    finally:
        event.remove(bind, "before_cursor_execute", track)


async def test_bogo_badge_is_not_attached_to_unrelated_products(db):
    from app.modules.inventory.models.product import Product

    tenant, user, product = await setup(db)
    other = Product(
        tenant_id=tenant.id, name="Unrelated", sku="UNRELATED", price=100, cost=40, stock=10
    )
    db.add(other)
    await db.flush()
    await add_rule(
        db,
        tenant,
        type="bogo",
        config={
            "buy": {"qty": 2, "product_ids": [str(product.id)]},
            "get": {"qty": 1, "product_ids": [str(product.id)]},
        },
    )
    result = await catalog_prices(db, user, request(other), None)
    assert result["items"][0]["offers"] == []


async def test_preview_deadline_is_promotion_expiry(db):
    tenant, user, product = await setup(db)
    expiry = datetime.now(UTC) + timedelta(seconds=5)
    await add_rule(db, tenant, ends_at=expiry)
    result = await catalog_prices(db, user, request(product), None)
    assert datetime.fromisoformat(result["valid_until"]) == expiry


async def test_receipt_reads_frozen_promotion_names_from_saved_order(db):
    from app.modules.sales.schemas.order import OrderCreate
    from app.modules.sales.service.order import create_order, get_order

    tenant, user, product = await setup(db)
    rule = await add_rule(db, tenant)
    order = await create_order(
        db,
        tenant.id,
        user.id,
        OrderCreate(
            pricing_channel="pos",
            items=[
                {
                    "product_id": product.id,
                    "product_name": product.name,
                    "unit_price": 100,
                    "quantity": 1,
                }
            ],
        ),
    )
    assert order.discount_details[0]["name"] == "Offer"
    rule.name = "Changed later"
    await db.flush()
    saved = await get_order(db, tenant.id, order.id)
    assert saved.discount_details[0]["name"] == "Offer"
    assert saved.total_discount == 10


async def test_paginated_product_category_filter_counts_and_searches_all_matching_rows(db):
    from app.modules.inventory.models.category import Category
    from app.modules.inventory.models.variant import ProductVariant
    from app.modules.inventory.service.product import count_products, list_products

    tenant, _user, product = await setup(db)
    category = Category(tenant_id=tenant.id, name="Phones")
    db.add(category)
    await db.flush()
    product.category_id = category.id
    variant = ProductVariant(
        product_id=product.id, sku="UNIQUE-SCAN", barcode="SCAN-1234", price=100, cost=40, stock=5
    )
    db.add(variant)
    await db.flush()
    found = await list_products(db, tenant.id, category_id=category.id, limit=1)
    assert [row.id for row in found] == [product.id]
    assert await count_products(db, tenant.id, category_id=category.id) == 1
    scanned = await list_products(db, tenant.id, search="SCAN-1234")
    assert [row.id for row in scanned] == [product.id]
    assert await count_products(db, tenant.id, search="SCAN-1234") == 1


async def test_approval_preview_is_verified_read_only_and_bound_to_cart(db):
    import json
    from types import SimpleNamespace

    from app.core.exceptions import ForbiddenError
    from app.modules.approvals.models import ApprovalRequest
    from app.modules.discounts.routes import preview
    from app.modules.discounts.schemas import ManualDiscount

    tenant, owner, product = await setup(db)
    tenant.discount_settings = {"enabled": True, "manual_pos": True, "approvals": True}
    await db.flush()
    user = SimpleNamespace(
        id=owner.id,
        tenant_id=tenant.id,
        role="cashier",
        role_id=None,
        is_superuser=False,
        permissions_names=["discounts:apply"],
    )
    cart = PriceIn(
        items=[{"product_id": product.id, "unit_price": 100, "quantity": 1}],
        manual_discount=ManualDiscount(kind="percent", value=10, reason="Fixture request"),
    )
    result, *_ = await quote(db, user, cart, None)
    approval = ApprovalRequest(
        tenant_id=tenant.id,
        kind="discount",
        status="approved",
        title="Fixture",
        requested_by=user.id,
        payload={"context_hash": result.context_hash, "pricing": result.dump()},
    )
    db.add(approval)
    await db.flush()
    cart.discount_approval_id = approval.id
    response = await preview(cart, db, user, None)
    assert json.loads(response.body)["data"]["approval_status"] == "approved"
    assert approval.applied_at is None
    cart.items[0].quantity = Decimal(2)
    with pytest.raises(ForbiddenError, match="changed"):
        await preview(cart, db, user, None)


async def test_half_price_bogo_does_not_advertise_a_free_reward(db):
    tenant, user, product = await setup(db)
    await add_rule(
        db, tenant, type="bogo", config={"buy": {"qty": 3}, "get": {"qty": 1, "percent": 50}}
    )
    result = await catalog_prices(db, user, request(product), None)
    assert "50% OFF" in result["items"][0]["offers"][0]["label"]
    assert result["items"][0]["unit_price"] == "100.00"
