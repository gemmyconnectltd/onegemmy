"""Transaction-level regressions. The shared db fixture rolls back all writes."""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.exceptions import ValidationError
from app.modules.discounts.models import AppliedDiscount, Coupon, CouponRedemption, DiscountRule
from app.modules.inventory.models.product import Product
from app.modules.sales.schemas.order import OrderCreate
from app.modules.sales.service.order import create_order
from app.modules.tenants.models import Tenant, User

pytestmark = pytest.mark.db


async def setup(db):
    nonce = uuid.uuid4().hex
    tenant = Tenant(
        name="Discount test",
        slug=f"discount-{nonce}",
        discount_settings={
            "enabled": True,
            "coupons": True,
            "automatic": True,
            "advanced": True,
        },
    )
    db.add(tenant)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        email=f"{nonce}@example.test",
        hashed_password="test",
        full_name="Owner",
        role="owner",
        is_superuser=True,
        is_active=True,
    )
    product = Product(
        tenant_id=tenant.id,
        name="Test item",
        sku=nonce,
        price=Decimal(100),
        cost=Decimal(40),
        stock=Decimal(10),
    )
    db.add_all([user, product])
    await db.flush()
    return tenant, user, product


async def test_checkout_snapshots_allocations_and_replays_without_redeeming_twice(db):
    tenant, user, product = await setup(db)
    rule = DiscountRule(
        tenant_id=tenant.id,
        name="Coupon",
        code="RULE",
        type="coupon",
        status="Active",
        value_kind="percent",
        value=Decimal(10),
        config={},
    )
    db.add(rule)
    await db.flush()
    coupon = Coupon(
        tenant_id=tenant.id, rule_id=rule.id, code="ONCE", status="Active", max_redemptions=1
    )
    db.add(coupon)
    await db.flush()
    data = OrderCreate(
        client_order_id=uuid.uuid4().hex,
        coupon_codes=["once"],
        items=[
            {
                "product_id": product.id,
                "product_name": product.name,
                "unit_price": 100,
                "quantity": 1,
            }
        ],
    )
    order = await create_order(db, tenant.id, user.id, data)
    assert order.total == 90
    assert order.items[0].discount == 10
    assert order.original_subtotal == 100
    assert order.total_discount == 10
    same = await create_order(db, tenant.id, user.id, data)
    assert same.id == order.id
    assert coupon.redeemed_count == 1
    applied = (
        await db.scalars(select(AppliedDiscount).where(AppliedDiscount.tenant_id == tenant.id))
    ).all()
    assert len(applied) == 1
    assert applied[0].lines == {str(order.items[0].id): "10.00"}
    rule.value = Decimal(50)
    await db.flush()
    assert applied[0].amount == Decimal(10)
    assert applied[0].snapshot["value"] == 10
    assert (
        len(
            (
                await db.scalars(
                    select(CouponRedemption).where(CouponRedemption.tenant_id == tenant.id)
                )
            ).all()
        )
        == 1
    )
    with pytest.raises(ValidationError):
        await create_order(
            db, tenant.id, user.id, data.model_copy(update={"client_order_id": uuid.uuid4().hex})
        )


async def test_foreign_tenant_product_cannot_be_priced_or_sold(db):
    tenant, user, _product = await setup(db)
    foreign, _, foreign_product = await setup(db)
    assert foreign.id != tenant.id
    with pytest.raises(ValidationError):
        await create_order(
            db,
            tenant.id,
            user.id,
            OrderCreate(
                items=[
                    {
                        "product_id": foreign_product.id,
                        "product_name": "Foreign",
                        "unit_price": 100,
                        "quantity": 1,
                    }
                ]
            ),
        )


async def test_discounted_split_sale_posts_balanced_ledger_and_refunds_original_price(db):
    from datetime import UTC, datetime

    from app.modules.accounting.models.transaction import Transaction
    from app.modules.sales.schemas.return_ import ReturnCreate
    from app.modules.sales.service.return_ import create_return

    tenant, user, product = await setup(db)
    rule = DiscountRule(
        tenant_id=tenant.id,
        name="Ten percent",
        code="TEN",
        type="percentage",
        status="Active",
        value_kind="percent",
        value=Decimal(10),
        config={},
    )
    db.add(rule)
    await db.flush()
    order = await create_order(
        db,
        tenant.id,
        user.id,
        OrderCreate(
            status="Completed",
            items=[
                {
                    "product_id": product.id,
                    "product_name": product.name,
                    "unit_price": 100,
                    "quantity": 2,
                }
            ],
            payments=[
                {"method": "cash", "amount": 50},
                {"method": "bank", "amount": 130, "reference": "TEST-REF"},
            ],
        ),
    )
    assert order.total == 180 and order.amount_paid == 180 and order.outstanding_balance == 0
    await db.refresh(product)
    assert product.stock == 8
    journals = (
        await db.scalars(
            select(Transaction).where(
                Transaction.tenant_id == tenant.id, Transaction.status == "Posted"
            )
        )
    ).all()
    assert journals
    for journal in journals:
        assert sum(
            Decimal(str(line.amount)) for line in journal.lines if line.type == "debit"
        ) == sum(Decimal(str(line.amount)) for line in journal.lines if line.type == "credit")
    rule.value = Decimal(50)
    await db.flush()
    returned = await create_return(
        db,
        tenant.id,
        user.id,
        ReturnCreate(
            order_id=order.id,
            status="Approved",
            return_date=datetime.now(UTC).date(),
            refund_method="cash",
            items=[
                {
                    "order_item_id": order.items[0].id,
                    "product_id": product.id,
                    "product_name": product.name,
                    "quantity": 1,
                    "refund_per_unit": 9999,
                }
            ],
        ),
    )
    assert returned.refund_amount == 90
    await db.refresh(product)
    assert product.stock == 9


async def test_concurrent_tills_cannot_both_redeem_last_coupon(db_conn):
    """Use a private schema so independent committing sessions cannot touch business records."""
    import asyncio

    from sqlalchemy import text
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.core.config import settings
    from app.core.database import Base, _json_serializer

    if make_url(settings.DATABASE_URL).host not in ("localhost", "127.0.0.1", "::1"):
        pytest.skip("Concurrency test is restricted to local PostgreSQL")
    schema = f"discount_test_{uuid.uuid4().hex}"
    control = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    isolated = None
    try:
        async with control.begin() as conn:
            await conn.execute(text(f"CREATE SCHEMA {schema}"))
        isolated = create_async_engine(
            settings.DATABASE_URL,
            poolclass=NullPool,
            json_serializer=_json_serializer,
            connect_args={"server_settings": {"search_path": schema}},
        )
        async with isolated.begin() as conn:

            def create_private_schema(sync_conn):
                from sqlalchemy import MetaData

                metadata = MetaData()
                for table in Base.metadata.tables.values():
                    table.to_metadata(metadata)
                # Legacy models declare some tenant indexes twice. Deduplicate only the isolated copy.
                seen = set()
                for table in metadata.tables.values():
                    for index in list(table.indexes):
                        if index.name in seen:
                            table.indexes.remove(index)
                        else:
                            seen.add(index.name)
                metadata.create_all(sync_conn)

            await conn.run_sync(create_private_schema)
        async with AsyncSession(isolated, expire_on_commit=False) as session:
            tenant, user, product = await setup(session)
            rule = DiscountRule(
                tenant_id=tenant.id,
                name="Last coupon",
                code="LAST",
                type="coupon",
                status="Active",
                value_kind="percent",
                value=Decimal(10),
                config={},
            )
            session.add(rule)
            await session.flush()
            session.add(
                Coupon(
                    tenant_id=tenant.id,
                    rule_id=rule.id,
                    code="LAST",
                    status="Active",
                    max_redemptions=1,
                )
            )
            await session.commit()
            tenant_id, user_id, product_id = tenant.id, user.id, product.id

        async def checkout():
            async with AsyncSession(isolated, expire_on_commit=False) as session:
                try:
                    await create_order(
                        session,
                        tenant_id,
                        user_id,
                        OrderCreate(
                            coupon_codes=["LAST"],
                            client_order_id=uuid.uuid4().hex,
                            items=[
                                {
                                    "product_id": product_id,
                                    "product_name": "Item",
                                    "unit_price": 100,
                                    "quantity": 1,
                                }
                            ],
                        ),
                    )
                    return "sold"
                except ValidationError:
                    await session.rollback()
                    return "limit"

        assert sorted(await asyncio.gather(checkout(), checkout())) == ["limit", "sold"]
    finally:
        if isolated:
            await isolated.dispose()
        async with control.begin() as conn:
            await conn.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
        await control.dispose()


async def test_cancelling_pending_sale_releases_coupon_without_deleting_history(db):
    from app.modules.sales.schemas.order import OrderUpdate
    from app.modules.sales.service.order import update_order

    tenant, user, product = await setup(db)
    rule = DiscountRule(
        tenant_id=tenant.id,
        name="Coupon",
        code="RELEASE",
        type="coupon",
        status="Active",
        value_kind="percent",
        value=Decimal(10),
        config={},
    )
    db.add(rule)
    await db.flush()
    coupon = Coupon(
        tenant_id=tenant.id, rule_id=rule.id, code="RELEASE", status="Active", max_redemptions=1
    )
    db.add(coupon)
    await db.flush()
    data = OrderCreate(
        coupon_codes=["RELEASE"],
        items=[
            {
                "product_id": product.id,
                "product_name": product.name,
                "unit_price": 100,
                "quantity": 1,
            }
        ],
    )
    first = await create_order(db, tenant.id, user.id, data)
    assert coupon.redeemed_count == 1
    await update_order(db, tenant.id, first.id, OrderUpdate(status="Cancelled"), user_id=user.id)
    assert coupon.redeemed_count == 0
    history = await db.scalar(select(CouponRedemption).where(CouponRedemption.order_id == first.id))
    assert history.released
    second = await create_order(db, tenant.id, user.id, data)
    assert second.id != first.id and coupon.redeemed_count == 1


async def test_partial_credit_sale_owes_only_the_discounted_balance(db):
    from datetime import UTC, datetime, timedelta

    from app.modules.sales.models.customer import Customer

    tenant, user, product = await setup(db)
    customer = Customer(tenant_id=tenant.id, name="Test buyer", customer_type="business")
    db.add(customer)
    db.add(
        DiscountRule(
            tenant_id=tenant.id,
            name="Ten percent",
            code="PART",
            type="percentage",
            status="Active",
            value_kind="percent",
            value=Decimal(10),
            config={},
        )
    )
    await db.flush()
    order = await create_order(
        db,
        tenant.id,
        user.id,
        OrderCreate(
            status="Completed",
            customer_id=customer.id,
            amount_paid=50,
            due_date=datetime.now(UTC).date() + timedelta(days=1),
            payment_method="cash",
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
    assert order.total == 90 and order.amount_paid == 50
    assert order.outstanding_balance == 40 and order.base_outstanding_balance == Decimal(40)


@pytest.mark.parametrize('discounts_enabled', [False, True])
@pytest.mark.parametrize('price', [70, 40])
async def test_pos_can_negotiate_down_to_unit_cost_without_changing_catalog(db, discounts_enabled, price):
    tenant, user, product = await setup(db)
    tenant.discount_settings = {'enabled': discounts_enabled}
    await db.flush()
    order = await create_order(db, tenant.id, user.id, OrderCreate(pricing_channel='pos', items=[{
        'product_id': product.id, 'product_name': product.name, 'unit_price': price, 'quantity': 2,
    }]))
    assert order.items[0].unit_price == price
    assert order.total == price * 2
    await db.refresh(product)
    assert product.price == Decimal(100)


@pytest.mark.parametrize('discounts_enabled', [False, True])
async def test_pos_rejects_price_below_unit_cost_with_or_without_discounts(db, discounts_enabled):
    tenant, user, product = await setup(db)
    tenant.discount_settings = {'enabled': discounts_enabled}
    await db.flush()
    with pytest.raises(ValidationError, match='below unit cost'):
        async with db.begin_nested():
            await create_order(db, tenant.id, user.id, OrderCreate(pricing_channel='pos', items=[{
                'product_id': product.id, 'product_name': product.name, 'unit_price': 39.99, 'quantity': 1,
            }]))


async def test_pos_discount_cannot_push_negotiated_price_below_cost(db):
    from app.core.exceptions import ForbiddenError
    tenant, user, product = await setup(db)
    db.add(DiscountRule(tenant_id=tenant.id, name='Thirty percent', code='COST-FLOOR', type='percentage',
                       status='Active', value_kind='percent', value=Decimal(30), config={}))
    await db.flush()
    with pytest.raises(ForbiddenError, match='below unit cost'):
        await create_order(db, tenant.id, user.id, OrderCreate(pricing_channel='pos', items=[{
            'product_id': product.id, 'product_name': product.name, 'unit_price': 50, 'quantity': 1,
        }]))


async def test_pos_checks_variant_cost_instead_of_parent_cost(db):
    from app.modules.inventory.models.variant import ProductVariant
    tenant, user, product = await setup(db)
    product.has_variants = True
    variant = ProductVariant(product_id=product.id, price=Decimal(100), cost=Decimal(55), stock=10)
    db.add(variant)
    await db.flush()
    with pytest.raises(ValidationError, match='below unit cost'):
        await create_order(db, tenant.id, user.id, OrderCreate(pricing_channel='pos', items=[{
            'product_id': product.id, 'variant_id': variant.id, 'product_name': product.name,
            'unit_price': 50, 'quantity': 1,
        }]))


async def test_rule_list_filters_usage_detail_and_history(db):
    from types import SimpleNamespace

    from app.modules.discounts.repository import DiscountRepository
    from app.modules.discounts.routes import _usage, rule_history, rule_usage

    tenant, user, product = await setup(db)
    rule = DiscountRule(tenant_id=tenant.id, name="Weekend ten", code="WEEKEND", type="percentage", status="Active", value_kind="percent", value=Decimal(10), config={})
    other = DiscountRule(tenant_id=tenant.id, name="Draft fixed", code="DRAFTFIX", type="fixed", status="Draft", value_kind="fixed", value=Decimal(5), config={})
    db.add_all([rule, other])
    await db.flush()
    order = await create_order(db, tenant.id, user.id, OrderCreate(client_order_id=uuid.uuid4().hex, items=[{"product_id": product.id, "product_name": product.name, "unit_price": 100, "quantity": 1}]))
    repo = DiscountRepository(db)
    rows, total = await repo.page(DiscountRule, tenant.id, 0, 25, "weekend", None, None)
    assert total == 1 and rows[0].id == rule.id  # search matches the name, not only the code
    rows, total = await repo.page(DiscountRule, tenant.id, 0, 25, None, "Draft", "fixed")
    assert [r.id for r in rows] == [other.id]
    usage = await _usage(db, tenant.id, [rule.id, other.id])
    assert usage[rule.id]["usage_count"] == 1 and Decimal(usage[rule.id]["discount_total"]) == Decimal(10) and other.id not in usage
    page = SimpleNamespace(offset=0, limit=25, page=1, page_size=25)
    applied = (await rule_usage(rule.id, db, user, page)).body
    assert order.order_number.encode() in applied
    history = (await rule_history(rule.id, db, user)).body
    assert history.startswith(b"{")


async def test_status_changes_answer_with_the_saved_offer_not_a_server_error(db):
    from app.modules.discounts.models import PromotionCampaign
    from app.modules.discounts.routes import campaign_status, rule_status
    from app.modules.discounts.schemas import StatusIn

    tenant, user, _product = await setup(db)
    tenant.discount_settings = {"campaigns": True}
    rule = DiscountRule(tenant_id=tenant.id, name="Status rule", code="STAT", type="percentage", status="Draft", value_kind="percent", value=Decimal(10), config={})
    promo = PromotionCampaign(tenant_id=tenant.id, name="Status promo", code="SPROMO", status="Draft")
    db.add_all([rule, promo])
    await db.flush()
    for status in ("Active", "Paused", "Archived"):
        body = (await rule_status(rule.id, StatusIn(status=status), db, user)).body
        assert f'"status":"{status}"'.encode() in body
    assert b'"status":"Active"' in (await campaign_status(promo.id, StatusIn(status="Active"), db, user)).body


def test_a_product_cannot_be_both_included_and_excluded():
    from app.modules.discounts.schemas import RuleIn

    same = str(uuid.uuid4())
    with pytest.raises(ValueError, match="both included and excluded"):
        RuleIn(name="Clash", type="percentage", value_kind="percent", value=10, config={"scope": {"product_ids": [same], "exclude_product_ids": [same]}})
