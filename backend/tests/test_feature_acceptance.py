"""The Feature Management acceptance scenario, end to end through the real API, real tokens and the real Cashier role."""
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import get_db
from app.core.deps import get_active_branch_id
from app.core.exceptions import ForbiddenError
from app.core.security import create_access_token
from app.main import app
from app.modules.billing.repository import BillingRepository
from app.modules.inventory.models.product import Product
from app.modules.tenants.models import Branch, Role, Tenant, User
from app.modules.tenants.service import ensure_permissions_seeded, seed_default_roles

API = "/api/v1/tenants"


@pytest.fixture(autouse=True)
def plan_entitlements_on(monkeypatch):
    """These tests are about plans deciding module access, which is switched off by default (ENFORCE_PLAN_ENTITLEMENTS)."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", True)


class Plan:
    """The subscription the test business is on; change `modules` to upgrade or downgrade it."""

    def __init__(self, *modules):
        self.modules = list(modules)

    async def subscription(self, *_):
        return SimpleNamespace(terms={"modules": self.modules}, plan_id=uuid.uuid4(), status="active", period_end=datetime.now(UTC) + timedelta(days=20))


def client(db, user):
    async def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    token = create_access_token(str(user.id), {"tenant_id": str(user.tenant_id)})
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {token}"})


@pytest.mark.db
async def test_acceptance_scenario(db, monkeypatch):
    plan = Plan("inventory", "sales", "accounting")  # Step 1: Manufacturing is not included
    monkeypatch.setattr(BillingRepository, "subscription", lambda self, tenant_id: plan.subscription())
    monkeypatch.setattr(BillingRepository, "first_unpaid", AsyncMock(return_value=None))
    key = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"Acme {key}", slug=f"acme-{key}", is_active=True, subscription_status="active")
    db.add(tenant)
    await db.flush()
    remera, kimironko = Branch(tenant_id=tenant.id, name="Remera", is_main=True), Branch(tenant_id=tenant.id, name="Kimironko")
    db.add_all([remera, kimironko])
    await seed_default_roles(db, tenant.id)
    await db.flush()
    cashier_role = (await db.execute(select(Role).where(Role.tenant_id == tenant.id, Role.name == "Cashier"))).scalar_one()
    owner = User(tenant_id=tenant.id, email=f"o{key}@x.test", hashed_password="x", full_name="Owner", role="owner", is_superuser=True, is_active=True)
    cashier = User(tenant_id=tenant.id, email=f"c{key}@x.test", hashed_password="x", full_name="Cashier", role="member", role_id=cashier_role.id,
                   branch_id=remera.id, branch_ids=[str(remera.id)], is_active=True)
    db.add_all([owner, cashier])
    db.add(Product(tenant_id=tenant.id, name="Existing stock item", price=5, cost=3, stock=10))
    await db.flush()
    await ensure_permissions_seeded(db)

    try:
        # Step 2: the administrator sees plan, available modules and what needs an upgrade.
        async with client(db, owner) as admin:
            modules = {m["key"]: m for m in (await admin.get(f"{API}/me/modules")).json()["data"]["modules"]}
            assert modules["inventory"]["status"] == modules["sales"]["status"] == "enabled"
            assert modules["manufacturing"]["status"] == "not_included"
            off = await admin.patch(f"{API}/me/modules/accounting", json={"enabled": False})
            assert off.status_code == 200 and {m["key"]: m["status"] for m in off.json()["data"]["modules"]}["accounting"] == "available"
            refused = await admin.patch(f"{API}/me/modules/manufacturing", json={"enabled": True})
            assert refused.status_code == 403 and "plan" in refused.json()["message"].lower()

        # Step 3 and 7: the cashier is limited by module AND by permission; direct API calls are refused.
        async with client(db, cashier) as till:
            assert (await till.get(f"{API}/me/entitlements")).json()["data"]["features"]["accounting"] is False
            assert (await till.patch(f"{API}/me/modules/accounting", json={"enabled": True})).status_code == 403  # not theirs to change
            assert (await till.post(f"{API}/accounting/expenses", json={})).status_code == 403  # module off
            assert (await till.post(f"{API}/manufacturing/orders", json={})).status_code == 403  # not in plan
            denied = await till.post(f"{API}/inventory/products", json={"name": "Sneaky"})
            assert denied.status_code == 403 and "permission" in denied.json()["message"].lower()  # module on, no permission
            assert (await till.get(f"{API}/inventory/products")).status_code == 200  # may look products up

        # Step 4: a cashier assigned to Remera cannot act in another branch by changing the branch header.
        async def active(user, header):
            return await get_active_branch_id(user, db, header)

        assert await active(cashier, remera.id) == remera.id
        with pytest.raises(ForbiddenError):
            await active(cashier, kimironko.id)

        # Step 5: an upgrade makes Manufacturing usable for the administrator; the cashier still has no permission for it.
        plan.modules.append("manufacturing")
        async with client(db, owner) as admin:
            status = {m["key"]: m["status"] for m in (await admin.get(f"{API}/me/modules")).json()["data"]["modules"]}
            assert status["manufacturing"] == "enabled"
            # Step 6: switching Manufacturing off again keeps the data and refuses new work.
            blocked = await admin.patch(f"{API}/me/modules/inventory", json={"enabled": False})
            assert blocked.status_code == 409  # manufacturing still relies on inventory
            assert (await admin.patch(f"{API}/me/modules/manufacturing", json={"enabled": False})).status_code == 200
            assert (await admin.patch(f"{API}/me/modules/inventory", json={"enabled": False})).status_code == 200
            listing = await admin.get(f"{API}/inventory/products")
            assert listing.status_code == 200 and "Existing stock item" in listing.text  # history stays readable
            assert (await admin.post(f"{API}/inventory/products", json={"name": "New", "price": 1})).status_code == 403  # new work refused
        async with client(db, cashier) as till:
            assert (await till.post(f"{API}/manufacturing/orders", json={})).status_code == 403
    finally:
        app.dependency_overrides.clear()

    assert (await db.execute(select(Product).where(Product.tenant_id == tenant.id, Product.name == "Existing stock item"))).scalar_one()
