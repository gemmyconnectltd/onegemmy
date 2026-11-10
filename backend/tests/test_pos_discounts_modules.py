"""POS and Discounts & Promotions are modules of their own: separate entitlement, switches and permissions."""
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.core.access import MODULE_RESOURCES, decide, decide_read
from app.modules.billing.repository import BillingRepository
from app.modules.tenants.models import FeatureFlag, Tenant
from app.modules.tenants.service import feature


@pytest.fixture(autouse=True)
def plan_entitlements_on(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", True)


async def states(db, monkeypatch, modules, price_created=None, activation=None, features=None):
    tenant = Tenant(name="Mods", slug=uuid.uuid4().hex, module_activation=activation or {}, features=features or {})
    db.add(tenant)
    await db.flush()
    price_id = None
    if price_created is not None:
        price_id = uuid.uuid4()
        real = db.execute

        async def execute(statement, *a, **k):
            if "billing_prices" in str(statement) and "created_at" in str(statement):
                return SimpleNamespace(scalar_one_or_none=lambda: price_created)
            return await real(statement, *a, **k)

        monkeypatch.setattr(db, "execute", execute)
    monkeypatch.setattr(BillingRepository, "subscription", AsyncMock(return_value=SimpleNamespace(terms={"modules": modules}, price_id=price_id, plan_id=uuid.uuid4(), status="active")))
    return tenant, await feature.resolve_modules(db, tenant.id)


async def test_new_flags_exist_and_pos_needs_sales(db):
    keys = {f.key: f for f in (await db.execute(select(FeatureFlag))).scalars().all()}
    assert {"pos", "discounts", "sales"} <= set(keys)
    assert keys["pos"].name == "Point of Sale" and keys["discounts"].name == "Discounts & Promotions"
    assert feature.DEPENDENCIES["pos"] == ("sales",) and feature.DEPENDENCIES["discounts"] == ("sales",)


async def test_a_plan_made_after_the_split_sells_each_module_separately(db, monkeypatch):
    _, got = await states(db, monkeypatch, ["sales", "inventory"], price_created=datetime(2027, 1, 1, tzinfo=UTC))
    assert got["sales"] == "enabled" and got["pos"] == "not_included" and got["discounts"] == "not_included"
    _, got = await states(db, monkeypatch, ["sales", "pos"], price_created=datetime(2027, 1, 1, tzinfo=UTC))
    assert got["pos"] == "enabled" and got["discounts"] == "not_included"


async def test_a_plan_made_before_the_split_keeps_pos_and_discounts_with_sales(db, monkeypatch):
    _, got = await states(db, monkeypatch, ["sales", "inventory"], price_created=datetime(2026, 6, 1, tzinfo=UTC))
    assert got["pos"] == "enabled" and got["discounts"] == "enabled"
    _, got = await states(db, monkeypatch, ["inventory"], price_created=datetime(2026, 6, 1, tzinfo=UTC))
    assert got["pos"] == "not_included" and got["discounts"] == "not_included"


async def test_pos_and_discounts_follow_the_business_switch_and_need_sales(db, monkeypatch):
    tenant, _ = await states(db, monkeypatch, ["sales", "pos", "discounts"], price_created=datetime(2027, 1, 1, tzinfo=UTC), activation={"pos": False})
    got = await feature.get_effective_features(db, tenant.id)
    assert got["sales"] and not got["pos"]
    tenant, _ = await states(db, monkeypatch, ["pos", "discounts"], price_created=datetime(2027, 1, 1, tzinfo=UTC))
    got = await feature.get_effective_features(db, tenant.id)
    assert not got["pos"] and not got["discounts"]  # without Sales there are no sales records to ring up or discount


def test_each_module_has_its_own_permission_group():
    assert MODULE_RESOURCES["pos"] == ("pos",) and MODULE_RESOURCES["discounts"] == ("discounts",)
    assert "discounts" not in MODULE_RESOURCES["sales"]


def test_a_discount_manager_needs_discount_permissions_and_a_cashier_can_still_price_a_cart():
    assert decide("discounts", "POST", "/sales/discounts/rules", ["discounts:create"])[0]
    assert not decide("discounts", "POST", "/sales/discounts/rules", ["pos:create", "orders:create"])[0]
    assert decide_read("discounts", "/sales/discounts/settings", ["pos:create"])[0]  # the till reads settings to show a cart
    assert not decide_read("discounts", "/sales/discounts/rules", ["invoices:read"])[0]
