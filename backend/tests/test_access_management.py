"""Users -> Access Management and Roles & Permissions: effective access, safe role changes and tenant isolation."""
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import get_db
from app.core.exceptions import ConflictError
from app.core.security import create_access_token
from app.main import app
from app.modules.billing.repository import BillingRepository
from app.modules.tenants.models import Branch, Role, Tenant, User
from app.modules.tenants.schemas import RoleUpdate
from app.modules.tenants.service import (
    access,
    delete_role,
    ensure_permissions_seeded,
    seed_default_roles,
    update_role,
)

API = "/api/v1/tenants"


@pytest.fixture(autouse=True)
def plan_entitlements_on(monkeypatch):
    """These tests are about plans deciding module access, which is switched off by default (ENFORCE_PLAN_ENTITLEMENTS)."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", True)


def plan(monkeypatch, *modules):
    sub = SimpleNamespace(terms={"modules": list(modules)}, plan_id=uuid.uuid4(), status="active", period_end=datetime.now(UTC) + timedelta(days=20))
    monkeypatch.setattr(BillingRepository, "subscription", AsyncMock(return_value=sub))
    monkeypatch.setattr(BillingRepository, "first_unpaid", AsyncMock(return_value=None))


async def business(db, label):
    key = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"{label} {key}", slug=f"{label.lower()}-{key}", is_active=True, subscription_status="active")
    db.add(tenant)
    await db.flush()
    await ensure_permissions_seeded(db)
    await seed_default_roles(db, tenant.id)
    await db.flush()
    roles = {r.name: r for r in (await db.execute(select(Role).where(Role.tenant_id == tenant.id))).scalars().all()}
    remera, kimironko = Branch(tenant_id=tenant.id, name="Remera", is_main=True), Branch(tenant_id=tenant.id, name="Kimironko")
    db.add_all([remera, kimironko])
    await db.flush()  # the branches need ids before anyone is assigned to them
    owner = User(tenant_id=tenant.id, email=f"o{key}@x.test", hashed_password="x", full_name="Olive Owner", role="owner", is_superuser=True, is_active=True)
    cashier = User(tenant_id=tenant.id, email=f"c{key}@x.test", hashed_password="x", full_name="Cathy Cashier", role="member", role_id=roles["Cashier"].id,
                   branch_id=remera.id, branch_ids=[str(remera.id)], is_active=True)
    db.add_all([owner, cashier])
    await db.flush()
    return tenant, roles, owner, cashier, remera, kimironko


def client(db, user):
    async def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    token = create_access_token(str(user.id), {"tenant_id": str(user.tenant_id)})
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {token}"})


@pytest.mark.db
async def test_system_roles_are_protected_and_a_role_in_use_cannot_be_deleted(db):
    tenant, roles, _, cashier, *_ = await business(db, "Roles")
    with pytest.raises(ConflictError, match="built-in"):
        await delete_role(db, tenant.id, roles["Cashier"].id)
    with pytest.raises(ConflictError, match="can't be renamed"):
        await update_role(db, tenant.id, roles["Cashier"].id, RoleUpdate(name="Till"))
    await update_role(db, tenant.id, roles["Cashier"].id, RoleUpdate(description="Front till"))  # editing the description is fine
    custom = Role(tenant_id=tenant.id, name="Shift lead")
    db.add(custom)
    await db.flush()
    cashier.role_id = custom.id
    await db.flush()
    with pytest.raises(ConflictError, match="1 person has this role"):
        await delete_role(db, tenant.id, custom.id)
    cashier.role_id = roles["Cashier"].id
    await db.flush()
    await delete_role(db, tenant.id, custom.id)
    assert (await db.execute(select(Role).where(Role.id == custom.id))).scalar_one_or_none() is None


@pytest.mark.db
async def test_effective_access_combines_permissions_with_the_business_module_state(db, monkeypatch):
    tenant, _, owner, cashier, remera, _ = await business(db, "Access")
    plan(monkeypatch, "inventory", "sales", "accounting")
    tenant.module_activation = {"accounting": False}  # the business turned Accounting off
    await db.flush()
    view = await access.user_access(db, tenant.id, cashier)
    by = {m["key"]: m for m in view["modules"]}
    assert by["sales"]["effective_view"] and by["sales"]["effective_change"]  # a cashier sells
    assert by["inventory"]["effective_view"] and not by["inventory"]["effective_change"]  # may look stock up, not change it
    # Invoices are shared by Sales and Accounting, so the cashier's invoices:read shows Accounting as viewable; nothing can be changed.
    assert by["accounting"]["can_view"] and not by["accounting"]["can_change"] and not by["hr"]["effective_view"]
    assert by["manufacturing"]["status"] == "not_included" and not by["manufacturing"]["effective_view"]
    assert view["branches"] == {"all": False, "branches": [{"id": str(remera.id), "name": "Remera"}]}
    # The owner holds every permission, yet a turned-off module is still read-only and one outside the plan is closed.
    owner_by = {m["key"]: m for m in (await access.user_access(db, tenant.id, owner))["modules"]}
    assert owner_by["accounting"]["effective_view"] and not owner_by["accounting"]["effective_change"]
    assert not owner_by["manufacturing"]["effective_view"] and owner_by["sales"]["effective_change"]
    assert (await access.user_access(db, tenant.id, owner))["branches"]["all"] is True


@pytest.mark.db
async def test_the_permission_matrix_comes_from_the_real_catalogue(db, monkeypatch):
    tenant, roles, *_ = await business(db, "Matrix")
    plan(monkeypatch, "inventory", "sales")
    view = await access.role_access(db, tenant.id, roles["Cashier"])
    assert view["role"]["built_in"] and view["role"]["users"] == 1
    catalogue = {p.name for p in await access.permission_catalog(db)}
    cells = [a for g in view["groups"] for r in g["resources"] for a in r["actions"].values()]
    assert {c["name"] for c in cells} == catalogue  # nothing invented, nothing missing
    granted = {c["name"] for c in cells if c["granted"]}
    assert {"pos:create", "orders:create", "items:read"} <= granted and "items:delete" not in granted
    assert {g["module"] for g in view["groups"]} >= {"sales", "inventory", "accounting", "business"}
    assert next(g for g in view["groups"] if g["module"] == "accounting")["status"] == "not_included"


@pytest.mark.db
async def test_access_summary_filters_counts_and_never_shows_another_business(db, monkeypatch):
    tenant, roles, owner, cashier, remera, kimironko = await business(db, "Summary")
    _, _, other_owner, *_ = await business(db, "Other")
    plan(monkeypatch, "inventory", "sales")
    everyone = await access.access_summary(db, tenant.id, search=None, role_id=None, branch_id=None, status=None, offset=0, limit=25)
    assert {r["email"] for r in everyone["items"]} == {owner.email, cashier.email}
    assert everyone["summary"]["total_users"] == 2 and everyone["summary"]["active_users"] == 2
    row = next(r for r in everyone["items"] if r["id"] == str(cashier.id))
    assert row["role"] == "Cashier" and row["branches"] == [{"id": str(remera.id), "name": "Remera"}] and "sales" in row["modules"] and "hr" not in row["modules"]
    assert next(r for r in everyone["items"] if r["id"] == str(owner.id))["all_branches"] is True
    only = lambda **kw: access.access_summary(db, tenant.id, **{"search": None, "role_id": None, "branch_id": None, "status": None, "offset": 0, "limit": 25, **kw})
    assert [r["email"] for r in (await only(role_id=roles["Cashier"].id))["items"]] == [cashier.email]
    assert {r["email"] for r in (await only(branch_id=kimironko.id))["items"]} == {owner.email}  # unrestricted people reach every branch
    assert [r["email"] for r in (await only(search="cathy"))["items"]] == [cashier.email]
    cashier.is_active = False
    await db.flush()
    assert [r["email"] for r in (await only(status="inactive"))["items"]] == [cashier.email]
    assert other_owner.email not in {r["email"] for r in everyone["items"]}


@pytest.mark.db
async def test_access_endpoints_need_permission_and_stay_inside_the_business(db, monkeypatch):
    _, roles, owner, cashier, *_ = await business(db, "Http")
    _, _, other_owner, other_cashier, *_ = await business(db, "Foreign")
    plan(monkeypatch, "inventory", "sales")
    try:
        async with client(db, cashier) as till:  # a cashier holds neither users:read nor roles:read
            assert (await till.get(f"{API}/users/access-summary")).status_code == 403
            assert (await till.get(f"{API}/users/{owner.id}/access")).status_code == 403
            assert (await till.get(f"{API}/roles/{roles['Cashier'].id}/access")).status_code == 403
        async with client(db, owner) as admin:
            ok = await admin.get(f"{API}/users/{cashier.id}/access")
            assert ok.status_code == 200 and ok.json()["data"]["user"]["role"] == "Cashier"
            assert (await admin.get(f"{API}/users/{other_cashier.id}/access")).status_code == 404  # someone else's employee
            assert (await admin.get(f"{API}/roles/{roles['Cashier'].id}/access")).status_code == 200
            foreign_role = (await db.execute(select(Role).where(Role.tenant_id == other_owner.tenant_id, Role.name == "Cashier"))).scalar_one()
            assert (await admin.get(f"{API}/roles/{foreign_role.id}/access")).status_code == 404
            assert (await admin.delete(f"{API}/roles/{roles['Admin'].id}")).status_code == 409
            summary = await admin.get(f"{API}/users/access-summary?status=active")
            assert summary.status_code == 200 and summary.json()["data"]["summary"]["total_users"] == 2
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_role_change_takes_effect_on_the_very_next_request(db, monkeypatch):
    """Access is read from the database on every request, never from the sign-in token, so revoking is immediate."""
    _, roles, owner, cashier, *_ = await business(db, "Revoke")
    plan(monkeypatch, "inventory", "sales")
    monkeypatch.setattr("app.modules.billing.worker.sync_usage", AsyncMock())  # usage billing is not what this test is about
    try:
        async with client(db, cashier) as till, client(db, owner) as admin:
            assert (await till.post(f"{API}/inventory/products", json={"name": "Widget", "price": 1})).status_code == 403
            promoted = await admin.patch(f"{API}/users/{cashier.id}", json={"role_id": str(roles["Inventory Officer"].id)})
            assert promoted.status_code == 200, promoted.text
            db.expire_all()  # one test session stands in for each request's own session
            assert (await till.post(f"{API}/inventory/products", json={"name": "Widget", "price": 1})).status_code != 403
            demoted = await admin.patch(f"{API}/users/{cashier.id}", json={"role_id": str(roles["Cashier"].id)})
            assert demoted.status_code == 200
            db.expire_all()
            assert (await till.post(f"{API}/inventory/products", json={"name": "Widget", "price": 1})).status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_module_detail_lists_the_roles_that_can_use_it_and_its_history(db, monkeypatch):
    _, _, owner, cashier, *_ = await business(db, "Detail")
    plan(monkeypatch, "inventory", "sales")
    try:
        async with client(db, owner) as admin:
            await admin.patch(f"{API}/me/modules/sales", json={"enabled": False})
            await admin.patch(f"{API}/me/modules/sales", json={"enabled": True})
            body = (await admin.get(f"{API}/me/modules/sales/access")).json()["data"]
            assert body["status"] == "enabled" and body["owners"] == 1
            cashier_row = next(r for r in body["roles"] if r["name"] == "Cashier")
            assert cashier_row["can_change"] and cashier_row["users"] == 1
            assert all(r["name"] != "Viewer" or not r["can_change"] for r in body["roles"])
            assert [h["action"] for h in body["history"]][:2] == ["tenant.module.enable", "tenant.module.disable"]
            assert (await admin.get(f"{API}/me/modules/nonsense/access")).status_code == 404
        async with client(db, cashier) as till:
            assert (await till.get(f"{API}/me/modules/sales/access")).status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_missing_builtin_roles_can_be_added_without_touching_existing_ones(db, monkeypatch):
    tenant, roles, owner, cashier, *_ = await business(db, "Seed")
    plan(monkeypatch, "inventory", "sales")
    monkeypatch.setattr("app.modules.billing.worker.sync_usage", AsyncMock())
    # An older business that never got Branch Manager, and whose Cashier role was deliberately tightened.
    manager = roles["Branch Manager"]
    await db.delete(manager)
    cashier_role = roles["Cashier"]
    cashier_role.permissions = [p for p in cashier_role.permissions if p.name != "contacts:create"]
    await db.flush()
    kept = {p.name for p in cashier_role.permissions}
    try:
        async with client(db, owner) as admin:
            first = await admin.post(f"{API}/roles/seed-defaults")
            assert first.status_code == 200 and first.json()["data"]["added"] == ["Branch Manager"]
            again = await admin.post(f"{API}/roles/seed-defaults")
            assert again.json()["data"]["added"] == []
        async with client(db, cashier) as till:
            assert (await till.post(f"{API}/roles/seed-defaults")).status_code == 403  # needs permission to change roles
    finally:
        app.dependency_overrides.clear()
    await db.refresh(cashier_role, attribute_names=["permissions"])
    assert {p.name for p in cashier_role.permissions} == kept  # existing roles were not rewritten
    assert (await db.execute(select(Role).where(Role.tenant_id == tenant.id, Role.name == "Branch Manager"))).scalar_one()
