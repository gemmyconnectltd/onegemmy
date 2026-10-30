"""Feature management: plan entitlement, tenant activation, dependencies, enforcement and the Super Admin directory."""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.core.deps import require_feature, require_permission
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.admin import features as admin_features
from app.modules.audit.models import AuditLog
from app.modules.billing.repository import BillingRepository
from app.modules.tenants import service
from app.modules.tenants.models import FeatureFlag, Tenant, User


@pytest.fixture(autouse=True)
def plan_entitlements_on(monkeypatch):
    """These tests are about plans deciding module access, which is switched off by default (ENFORCE_PLAN_ENTITLEMENTS)."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", True)


def plan(monkeypatch, *modules):
    """Pretend the business is on a plan that includes `modules` (the plan's terms are the entitlement)."""
    sub = SimpleNamespace(terms={"modules": list(modules)}, plan_id=uuid.uuid4(), status="active")
    monkeypatch.setattr(BillingRepository, "subscription", AsyncMock(return_value=sub))
    return sub


async def business(db, **kw):
    tenant = Tenant(name="Acme", slug=uuid.uuid4().hex, **kw)
    db.add(tenant)
    await db.flush()
    return tenant


def request(method):
    return SimpleNamespace(method=method)


@pytest.mark.db
async def test_catalogue_has_repairs_so_the_repairs_api_is_reachable(db):
    assert (await db.execute(select(FeatureFlag).where(FeatureFlag.key == "repairs"))).scalar_one().is_active


@pytest.mark.db
async def test_plan_decides_what_is_included(db, monkeypatch):
    tenant = await business(db)
    plan(monkeypatch, "inventory", "sales", "accounting")
    states = await service.resolve_modules(db, tenant.id)
    assert states["inventory"] == states["sales"] == states["accounting"] == "enabled"
    assert states["manufacturing"] == "not_included"
    assert (await service.get_effective_features(db, tenant.id))["manufacturing"] is False


@pytest.mark.db
async def test_administrator_turns_an_included_module_off_and_on_without_touching_data(db, monkeypatch):
    tenant = await business(db)
    plan(monkeypatch, "inventory", "sales", "accounting")
    off = await service.set_module_activation(db, tenant.id, "accounting", False)
    assert {m["key"]: m["status"] for m in off["modules"]}["accounting"] == "available"
    assert (await service.get_effective_features(db, tenant.id))["accounting"] is False
    assert tenant.module_activation == {"accounting": False}
    on = await service.set_module_activation(db, tenant.id, "accounting", True)
    assert {m["key"]: m["status"] for m in on["modules"]}["accounting"] == "enabled" and tenant.module_activation == {}


@pytest.mark.db
async def test_administrator_cannot_activate_what_the_plan_lacks_or_the_platform_restricted(db, monkeypatch):
    tenant = await business(db, features={"sales": False})
    plan(monkeypatch, "inventory", "sales")
    with pytest.raises(ForbiddenError, match="not part of your plan"):
        await service.set_module_activation(db, tenant.id, "manufacturing", True)
    assert (await service.resolve_modules(db, tenant.id))["sales"] == "restricted"
    with pytest.raises(ForbiddenError, match="restricted"):
        await service.set_module_activation(db, tenant.id, "sales", True)
    with pytest.raises(NotFoundError):
        await service.set_module_activation(db, tenant.id, "nonsense", True)


@pytest.mark.db
async def test_dependencies_are_explained_and_enforced(db, monkeypatch):
    tenant = await business(db)
    plan(monkeypatch, "inventory", "manufacturing", "procurement")
    with pytest.raises(ConflictError, match="Manufacturing"):
        await service.set_module_activation(db, tenant.id, "inventory", False)
    await service.set_module_activation(db, tenant.id, "manufacturing", False)
    await service.set_module_activation(db, tenant.id, "procurement", False)
    await service.set_module_activation(db, tenant.id, "inventory", False)
    with pytest.raises(ValidationError, match="Inventory"):
        await service.set_module_activation(db, tenant.id, "manufacturing", True)


@pytest.mark.db
async def test_downgrade_restricts_but_keeps_choices_and_upgrade_restores(db, monkeypatch):
    tenant = await business(db)
    plan(monkeypatch, "inventory", "hr")
    await service.set_module_activation(db, tenant.id, "hr", False)
    plan(monkeypatch, "inventory")  # downgrade drops HR
    assert (await service.resolve_modules(db, tenant.id))["hr"] == "not_included"
    assert tenant.module_activation == {"hr": False}  # the business's own choice is remembered
    plan(monkeypatch, "inventory", "hr", "manufacturing")  # upgrade
    states = await service.resolve_modules(db, tenant.id)
    assert states["hr"] == "available" and states["manufacturing"] == "enabled"


@pytest.mark.db
async def test_one_business_never_changes_another(db, monkeypatch):
    a, b = await business(db), await business(db)
    plan(monkeypatch, "inventory", "hr")
    await service.set_module_activation(db, a.id, "hr", False)
    assert (await service.resolve_modules(db, b.id))["hr"] == "enabled"


@pytest.mark.db
async def test_api_guard_blocks_writes_to_a_turned_off_module_but_keeps_history_readable(db, monkeypatch):
    tenant = await business(db)
    plan(monkeypatch, "inventory", "sales", "hr")
    await service.set_module_activation(db, tenant.id, "hr", False)
    user = SimpleNamespace(tenant_id=tenant.id)
    guard = require_feature("hr")
    assert await guard(request("GET"), db, user) is user
    with pytest.raises(ForbiddenError, match="turned off"):
        await guard(request("POST"), db, user)
    with pytest.raises(ForbiddenError, match="not part of your plan"):
        await require_feature("manufacturing")(request("GET"), db, user)  # not in plan: no access at all
    assert await require_feature("sales")(request("POST"), db, user) is user
    assert await guard(request("POST"), db, SimpleNamespace(tenant_id=None)) is not None  # platform staff unaffected


async def test_only_someone_with_tenant_update_may_switch_modules():
    check = require_permission("tenants:update")
    cashier = SimpleNamespace(is_superuser=False, id=uuid.uuid4(), permissions_names={"orders:create"})
    with pytest.raises(ForbiddenError):
        await check(cashier)
    owner = SimpleNamespace(is_superuser=True, id=uuid.uuid4(), permissions_names=set())
    assert await check(owner) is owner


@pytest.mark.db
async def test_directory_counts_plans_and_edits_are_audited_and_guarded(db, monkeypatch):
    admin = User(email=f"{uuid.uuid4().hex}@pesaa.test", full_name="Admin", role="superadmin", is_superuser=True, hashed_password="x")
    db.add(admin)
    await db.flush()
    rows = (await admin_features.feature_directory(db, admin)).body
    assert b'"key":"repairs"' in rows and b'"total_tenants"' in rows
    detail = await admin_features.feature_detail("inventory", db, admin)
    assert b'"needed_by"' in detail.body
    with pytest.raises(NotFoundError):
        await admin_features.feature_detail("nope", db, admin)
    with pytest.raises(ValidationError):  # switching a feature off platform-wide needs its key typed back
        await admin_features.update_feature("queue", admin_features.FeaturePatch(is_active=False), db, admin)
    with pytest.raises(ConflictError):  # inventory is relied on by manufacturing
        await admin_features.update_feature("inventory", admin_features.FeaturePatch(is_active=False, confirm_key="inventory"), db, admin)
    await admin_features.update_feature("queue", admin_features.FeaturePatch(description="  Walk-ins  "), db, admin)
    flag = (await db.execute(select(FeatureFlag).where(FeatureFlag.key == "queue"))).scalar_one()
    assert flag.description == "Walk-ins"
    entry = (await db.execute(select(AuditLog).where(AuditLog.entity_id == "queue", AuditLog.action == "feature.update"))).scalars().first()
    assert entry is not None and entry.actor_user_id == admin.id


@pytest.mark.db
async def test_only_real_business_dependencies_are_forced(db, monkeypatch):
    """Purchases and services work without accounting or sales, so turning those off must not be blocked."""
    from app.modules.tenants.service.feature import DEPENDENCIES
    assert DEPENDENCIES == {"manufacturing": ("inventory",), "procurement": ("inventory",), "appointments": ("services",), "queue": ("services",)}
    tenant = await business(db)
    plan(monkeypatch, "inventory", "sales", "accounting", "procurement", "services")
    await service.set_module_activation(db, tenant.id, "accounting", False)
    await service.set_module_activation(db, tenant.id, "sales", False)
    states = await service.resolve_modules(db, tenant.id)
    assert states["procurement"] == "enabled" and states["services"] == "enabled"


@pytest.mark.db
async def test_pesaa_restriction_and_the_business_choice_stay_separate(db, monkeypatch):
    """Scenario: Pesaa restricts a module. The business can't lift it, nobody bypasses it, and removing it
    gives back exactly what the business had chosen (it never rewrites the business's switch)."""
    from app.modules.tenants.schemas import FeatureOverrideUpdate
    tenant = await business(db)
    plan(monkeypatch, "inventory", "manufacturing")
    await service.set_module_activation(db, tenant.id, "manufacturing", False)  # the business turned it off itself
    states = {s.key: s for s in await service.set_tenant_features(db, tenant.id, FeatureOverrideUpdate(features={"manufacturing": False}))}
    m = states["manufacturing"]
    assert (m.status, m.included, m.restricted, m.business_off, m.enabled) == ("restricted", True, True, True, False)
    with pytest.raises(ForbiddenError, match="restricted"):
        await service.set_module_activation(db, tenant.id, "manufacturing", True)  # the business cannot override Pesaa
    with pytest.raises(ForbiddenError, match="restricted"):
        await require_feature("manufacturing")(request("GET"), db, SimpleNamespace(tenant_id=tenant.id))
    assert tenant.module_activation == {"manufacturing": False}  # untouched by the restriction
    after = {s.key: s for s in await service.reset_tenant_features(db, tenant.id)}["manufacturing"]
    assert (after.status, after.restricted, after.business_off) == ("available", False, True)  # their own choice is back
    assert tenant.module_activation == {"manufacturing": False}
    await service.set_module_activation(db, tenant.id, "manufacturing", True)
    assert (await service.resolve_modules(db, tenant.id))["manufacturing"] == "enabled"


@pytest.mark.db
async def test_with_plan_entitlements_off_every_module_is_available_whatever_the_plan(db, monkeypatch):
    """The current default: a plan (or no plan) decides nothing about features. Pesaa's restriction and the business's own switch still do."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", False)
    tenant = await business(db, features={"sales": False})
    plan(monkeypatch, "inventory")  # a plan that includes almost nothing
    states = await service.resolve_modules(db, tenant.id)
    assert states["manufacturing"] == "enabled" and states["repairs"] == "enabled"  # not in the plan, yet usable
    assert states["sales"] == "restricted"  # Pesaa's own restriction still closes it
    await service.set_module_activation(db, tenant.id, "manufacturing", False)  # the business can still switch it off
    assert (await service.resolve_modules(db, tenant.id))["manufacturing"] == "available"
    assert (await service.get_effective_features(db, tenant.id))["repairs"] is True
    assert await require_feature("repairs")(request("POST"), db, SimpleNamespace(tenant_id=tenant.id)) is not None
