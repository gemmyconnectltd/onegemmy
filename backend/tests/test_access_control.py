"""Backend authorisation for ERP writes, default roles and the role review tools."""
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core import access
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.modules.tenants.models import Permission, Role, Tenant, User
from app.modules.tenants.service import ensure_permissions_seeded, seed_default_roles

# ── The pure rule ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("module", "method", "path", "held", "allowed"),
    [
        ("sales", "POST", "/sales/customers", [], False),
        ("sales", "POST", "/sales/customers", ["contacts:read", "expenses:read"], False),  # the case from the audit
        ("sales", "POST", "/sales/customers", ["contacts:create"], True),
        ("sales", "POST", "/sales/customers", ["orders:create"], False),  # selling is not the same as managing customers
        ("sales", "PATCH", "/sales/customers/abc", ["contacts:create"], False),
        ("sales", "PATCH", "/sales/customers/abc", ["contacts:update"], True),
        ("sales", "DELETE", "/sales/customers/abc", ["contacts:update"], False),
        ("sales", "POST", "/sales/orders", ["pos:create"], True),  # a cashier can check out
        ("sales", "POST", "/sales/orders", ["orders:read", "invoices:read"], False),
        ("hr", "POST", "/hr/employees", ["employees:read"], False),
        ("hr", "POST", "/hr/employees", ["employees:create"], True),
        ("hr", "DELETE", "/hr/employees/x", ["employees:update"], False),
        ("hr", "DELETE", "/hr/employees/x", ["employees:delete"], True),
        ("accounting", "POST", "/accounting/tax/calculate/vat", [], True),  # a pure calculator changes nothing
        ("accounting", "POST", "/debts/receivable/search", [], True),
        ("accounting", "POST", "/accounting/expenses", ["expenses:create"], True),
        ("inventory", "PUT", "/inventory/products/1", ["items:read"], False),
        ("sales", "GET", "/sales/orders", [], True),  # reads are not gated here
    ],
)
def test_decision_rule(module, method, path, held, allowed):
    assert access.decide(module, method, path, held)[0] is allowed


def test_every_routed_module_has_a_resource_map():
    from app.api_router import api_router  # noqa: F401  (importing proves the guards are wired)

    assert set(access.MODULE_RESOURCES) >= {"inventory", "sales", "accounting", "hr", "procurement", "crm", "manufacturing", "services", "repairs"}


# ── HTTP: real tokens through the real dependencies ──────────────────────────




async def _user(db, perms: list[str], *, owner: bool = False):
    n = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"AC {n}", slug=f"ac-{n}", is_active=True, subscription_status="active")
    db.add(tenant)
    await db.flush()
    catalog = {p.name: p for p in await ensure_permissions_seeded(db)}
    role = Role(tenant_id=tenant.id, name=f"r-{n}", permissions=[catalog[p] for p in perms])
    db.add(role)
    await db.flush()
    user = User(email=f"u{n}@x.test", hashed_password="x", full_name="U", role="owner" if owner else "member", tenant_id=tenant.id, role_id=role.id, is_active=True, is_superuser=owner)
    db.add(user)
    await db.flush()
    return user, create_access_token(str(user.id), {"tenant_id": str(tenant.id)})


async def _client(db, token):
    async def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {token}"})


CUSTOMER = {"name": "Test Customer", "customer_type": "individual"}


@pytest.mark.db
async def test_writes_need_a_matching_permission_and_owner_is_not_restricted(db):
    try:
        _, none_token = await _user(db, [])
        _, reader_token = await _user(db, ["contacts:read", "expenses:read"])
        _, creator_token = await _user(db, ["contacts:create", "contacts:read"])
        _, owner_token = await _user(db, [], owner=True)

        async with await _client(db, none_token) as c:
            denied = [await c.post("/api/v1/tenants/sales/customers", json=CUSTOMER), await c.post("/api/v1/tenants/hr/employees", json={}),
                      await c.post("/api/v1/tenants/accounting/expenses", json={}), await c.delete(f"/api/v1/tenants/sales/customers/{uuid.uuid4()}")]
            assert [r.status_code for r in denied] == [403, 403, 403, 403]
            assert "permission" in denied[0].json()["message"].lower()
            assert (await c.post("/api/v1/tenants/accounting/tax/calculate/vat", json={})).status_code != 403  # calculators stay open
        async with await _client(db, reader_token) as c:  # the exact case from the staging audit
            assert (await c.post("/api/v1/tenants/sales/customers", json=CUSTOMER)).status_code == 403
        async with await _client(db, creator_token) as c:
            created = await c.post("/api/v1/tenants/sales/customers", json=CUSTOMER)
            assert created.status_code == 201, created.text
            assert (await c.patch(f"/api/v1/tenants/sales/customers/{created.json()['data']['id']}", json={"name": "Renamed"})).status_code == 403  # create ≠ update
        async with await _client(db, owner_token) as c:
            assert (await c.post("/api/v1/tenants/sales/customers", json=CUSTOMER)).status_code == 201
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_structural_endpoints_are_guarded(db):
    try:
        _, token = await _user(db, ["departments:read", "tenants:read"])
        _, other_tenant = await _user(db, [])
        async with await _client(db, token) as c:
            assert (await c.post("/api/v1/tenants/departments", json={"name": "Ops"})).status_code == 403
            assert (await c.post("/api/v1/tenants/", json={"name": "Another", "slug": "another-co"})).status_code == 403  # creating companies is platform-only
        user, owner_token = await _user(db, [], owner=True)
        async with await _client(db, owner_token) as c:
            assert (await c.post("/api/v1/tenants/", json={"name": "Another", "slug": "another-co"})).status_code == 403  # even a tenant owner
        assert user.tenant_id and other_tenant
    finally:
        app.dependency_overrides.clear()


# ── Default roles ─────────────────────────────────────────────────────────────

@pytest.mark.db
async def test_default_roles_follow_least_privilege(db):
    tenant = Tenant(name="Roles", slug=f"roles-{uuid.uuid4().hex[:6]}", is_active=True)
    db.add(tenant)
    await db.flush()
    await seed_default_roles(db, tenant.id)
    await db.flush()
    roles = {r.name: {p.name for p in r.permissions} for r in (await db.execute(select(Role).where(Role.tenant_id == tenant.id))).scalars().all()}
    assert {"Admin", "Member", "Viewer", "Cashier", "Accountant", "Inventory Officer", "Branch Manager"} <= set(roles)

    member = roles["Member"]
    assert member and not any(p.endswith((":delete", ":approve")) for p in member)  # the everyday default can't delete or approve
    assert not any(p.split(":")[0] in {"users", "roles", "billing", "tenants", "permissions", "credit"} for p in member)
    assert any(p.endswith(":delete") for p in roles["Branch Manager"])  # a manager still can
    assert not any(p.endswith(":delete") for p in roles["Viewer"]) and all(p.endswith(":read") for p in roles["Viewer"])

    cashier = roles["Cashier"]
    assert "pos:create" in cashier and "orders:create" in cashier and not any(p.split(":")[0] in {"journal_entries", "payroll", "employees", "users", "roles", "billing"} for p in cashier)
    assert not any(p.endswith(":delete") for p in cashier)
    accountant = roles["Accountant"]
    assert "journal_entries:create" in accountant and "expenses:approve" in accountant and not any(p.split(":")[0] in {"items", "employees", "users", "roles"} and not p.endswith(":read") for p in accountant)
    inventory = roles["Inventory Officer"]
    assert "stock:update" in inventory and not any(p.split(":")[0] in {"journal_entries", "payroll", "banking", "users"} for p in inventory)
    # a cashier cannot do what the module rule reserves for other roles
    assert access.decide("sales", "POST", "/sales/orders", cashier)[0] is True
    assert access.decide("hr", "POST", "/hr/employees", cashier)[0] is False
    assert access.decide("accounting", "POST", "/accounting/transactions", cashier)[0] is False
    assert access.decide("inventory", "PATCH", "/inventory/products/1", inventory)[0] is True


@pytest.mark.db
async def test_role_review_and_explicit_tightening(db):
    try:
        n = uuid.uuid4().hex[:6]
        owner, token = await _user(db, [], owner=True)
        broad = Role(tenant_id=owner.tenant_id, name="Member", description="legacy broad member")
        catalog = await ensure_permissions_seeded(db)
        broad.permissions = [p for p in catalog if p.resource not in {"users", "roles", "permissions", "credit", "billing", "tenants"}]
        custom = Role(tenant_id=owner.tenant_id, name=f"Custom {n}", permissions=[p for p in catalog if p.name == "items:delete"])
        db.add_all([broad, custom])
        await db.flush()
        async with await _client(db, token) as c:
            review = (await c.get("/api/v1/tenants/roles/review")).json()["data"]
            row = next(r for r in review if r["name"] == "Member")
            assert row["canTighten"] and row["deletePermissions"] > 0 and row["approvePermissions"] > 0
            assert (await c.post(f"/api/v1/tenants/roles/{custom.id}/tighten")).status_code == 409  # custom roles are never touched this way
            done = await c.post(f"/api/v1/tenants/roles/{broad.id}/tighten")
            assert done.status_code == 200 and done.json()["data"]["removed"] > 0
        await db.refresh(broad)
        assert not any(p.action in {"delete", "approve"} for p in broad.permissions) and broad.permissions
        _, no_roles = await _user(db, [])
        async with await _client(db, no_roles) as c:
            assert (await c.get("/api/v1/tenants/roles/review")).status_code == 403  # reviewing roles needs roles:read
    finally:
        app.dependency_overrides.clear()


_ = Permission
