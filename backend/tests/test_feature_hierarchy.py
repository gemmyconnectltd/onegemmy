"""Submodules and features inside modules: what each covers, the platform switch and per-business restrictions."""
import importlib.util
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import update

from app.core.access import tenant_path
from app.core.deps import _check_feature_item
from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.tenants.feature_tree import BY_KEY, TREE, chain, feature_for_path
from app.modules.tenants.models import ModuleFeature, Tenant
from app.modules.tenants.service import feature_items

VERSIONS = Path(__file__).resolve().parent.parent / "alembic" / "versions"
MIGRATIONS = [VERSIONS / "e6a1c9f4b702_module_feature_hierarchy.py", VERSIONS / "a3c8e5f1d907_feature_overrides_activity_more_parts.py",
              VERSIONS / "b7d4f0a2c613_pos_feature_parts.py"]


def test_every_feature_path_is_a_real_tenant_route():
    from app import main
    # Module routers are nested groups in `app.routes`; the OpenAPI paths list every route flat.
    routes = {tenant_path(path) for path in main.app.openapi()["paths"] if path.startswith("/api/v1/tenants")}
    for node in TREE:
        if node.virtual:  # recognised from the request body, not a route
            continue
        for p in node.paths:
            assert any(r == p or r.startswith(p + "/") for r in routes), f"{node.key}: no route under {p}"


def test_parents_exist_and_are_submodules_of_the_same_module():
    for node in TREE:
        if node.parent:
            parent = BY_KEY[node.parent]
            assert parent.level == "submodule" and parent.module == node.module
        assert node.key.startswith(node.module + ".")


def test_paths_match_on_segment_boundaries_only():
    assert feature_for_path("inventory", "/inventory/transfers") == "inventory.transfers"
    assert feature_for_path("inventory", "/inventory/transfers/123/receive") == "inventory.transfers"
    assert feature_for_path("inventory", "/inventory/transfers-report") is None
    assert feature_for_path("inventory", "/inventory/products") is None
    assert feature_for_path("sales", "/inventory/transfers") is None  # another module's guard never claims it
    assert chain("inventory.serials") == ["inventory.serials", "inventory.traceability"]


def test_migrations_seed_exactly_the_tree():
    seeded = set()
    for path in MIGRATIONS:
        spec = importlib.util.spec_from_file_location(path.stem, path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        seeded |= {(k, m, p, lvl, n) for k, m, p, lvl, n, _d, _s in mod.ROWS}
    assert seeded == {(n.key, n.module, n.parent, n.level, n.name) for n in TREE}


def _request(method: str, path: str):
    return SimpleNamespace(method=method, url=SimpleNamespace(path=f"/api/v1/tenants{path}"))


async def _tenant(db) -> Tenant:
    tenant = Tenant(name="Hierarchy", slug=uuid.uuid4().hex)
    db.add(tenant)
    await db.flush()
    return tenant


@pytest.mark.db
async def test_platform_switch_off_refuses_writes_but_keeps_reads(db):
    tenant = await _tenant(db)
    user = SimpleNamespace(tenant_id=tenant.id)
    await db.execute(update(ModuleFeature).where(ModuleFeature.key == "inventory.transfers").values(is_active=False))
    with pytest.raises(ForbiddenError, match="switched off"):
        await _check_feature_item(_request("POST", "/inventory/transfers"), db, user, "inventory")
    await _check_feature_item(_request("GET", "/inventory/transfers"), db, user, "inventory")  # history stays readable
    await _check_feature_item(_request("POST", "/inventory/products"), db, user, "inventory")  # the rest of the module works


@pytest.mark.db
async def test_switching_off_a_submodule_covers_its_features(db):
    tenant = await _tenant(db)
    await db.execute(update(ModuleFeature).where(ModuleFeature.key == "inventory.traceability").values(is_active=False))
    assert await feature_items.blocked_feature(db, tenant.id, "inventory", "/inventory/serials") == ("switched_off", "Serial numbers")
    assert await feature_items.blocked_feature(db, tenant.id, "inventory", "/inventory/transfers") is None


@pytest.mark.db
async def test_restriction_is_per_business_needs_a_reason_and_restores(db):
    one, other = await _tenant(db), await _tenant(db)
    with pytest.raises(ValidationError):
        await feature_items.set_restriction(db, one.id, "hr.payroll", True, "", None)
    assert await feature_items.set_restriction(db, one.id, "hr.payroll", True, "Unpaid invoice", None)
    assert not await feature_items.set_restriction(db, one.id, "hr.payroll", True, "Again", None)  # idempotent
    assert await feature_items.blocked_feature(db, one.id, "hr", "/hr/payroll/runs") == ("restricted", "Payroll")
    assert await feature_items.blocked_feature(db, other.id, "hr", "/hr/payroll/runs") is None
    assert await feature_items.set_restriction(db, one.id, "hr.payroll", False, None, None)
    assert await feature_items.blocked_feature(db, one.id, "hr", "/hr/payroll/runs") is None


@pytest.mark.db
async def test_part_states_tell_the_erp_what_is_read_only(db):
    tenant = await _tenant(db)
    modules = {"inventory": "enabled", "hr": "enabled", "sales": "not_included"}
    await db.execute(update(ModuleFeature).where(ModuleFeature.key == "inventory.traceability").values(is_active=False))
    await feature_items.set_restriction(db, tenant.id, "hr.leave", True, "Policy review", None)
    states = await feature_items.part_states(db, tenant.id, modules)
    assert states["inventory.batches"] == "switched_off"  # through its submodule
    assert states["inventory.transfers"] == "on"
    assert states["hr.leave"] == "restricted" and states["hr.payroll"] == "on"
    assert states["sales.quotations"] == "module_off"


def test_a_till_sale_is_recognised_with_its_payment_methods_and_manual_discount():
    from app.modules.tenants.feature_tree import sale_paths
    assert sale_paths({"pricing_channel": "sales_order", "payment_method": "cash"}) == []
    assert sale_paths({"pricing_channel": "pos", "payment_method": "cash"}) == ["/pos/sale", "/pos/pay/cash"]
    split = sale_paths({"pricing_channel": "pos", "payments": [{"method": "mobile"}, {"method": "card"}], "manual_discount": {"percent": 5}})
    assert split == ["/pos/sale", "/pos/pay/mobile", "/pos/pay/card", "/pos/manual-discount"]
    assert feature_for_path("pos", "/pos/pay/mobile") == "pos.mobile_money"
    assert feature_for_path("pos", "/pos/sale") is None  # the module itself
    assert sale_paths(None) == [] and sale_paths("x") == []
