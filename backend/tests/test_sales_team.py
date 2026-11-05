"""Salespeople: who is credited with a sale, the report built on it, and the opt-in own-sales rule."""
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.inventory.models.product import Product
from app.modules.tenants.models import Branch, Role, Tenant, User

API = "/api/v1/tenants"


async def team(db, monkeypatch):
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", False)
    tenant = Tenant(name="Team test", slug=uuid.uuid4().hex, currency="RWF", is_active=True, subscription_status="active", approval_rules={})
    db.add(tenant)
    await db.flush()
    branch = Branch(tenant_id=tenant.id, name="Main", is_main=True)
    role = Role(tenant_id=tenant.id, name="Salesperson", permissions=[])
    product = Product(tenant_id=tenant.id, name="Widget", price=100, cost=50, stock=100)
    db.add_all([branch, role, product])
    await db.flush()

    def member(name):
        return User(tenant_id=tenant.id, full_name=name, email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                    is_superuser=False, role="member", role_id=role.id)

    ann, ben = member("Ann"), member("Ben")
    owner = User(tenant_id=tenant.id, full_name="Owner", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                 is_superuser=True, role="owner")
    db.add_all([ann, ben, owner])
    await db.flush()
    await seed_default_accounts(db, tenant.id)

    async def session():
        yield db

    app.dependency_overrides[get_db] = session

    def client(user):
        token = create_access_token(str(user.id), {"tenant_id": str(tenant.id)})
        return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t",
                           headers={"Authorization": f"Bearer {token}", "X-Branch-Id": str(branch.id)})

    def sale(qty, **extra):
        return {"status": "Completed", "client_order_id": uuid.uuid4().hex, "payment_method": "cash", "amount_paid": 100 * qty, "amount_tendered": 100 * qty,
                "items": [{"product_id": str(product.id), "product_name": product.name, "unit_price": 100, "quantity": qty}], **extra}

    return tenant, ann, ben, owner, client, sale


@pytest.mark.db
async def test_sales_are_credited_to_the_chosen_salesperson_not_the_person_who_keyed_them(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    try:
        async with client(owner) as c:
            keyed_for_ann = await c.post(f"{API}/sales/orders", json=sale(2, salesperson_id=str(ann.id)))
            assert keyed_for_ann.status_code == 201, keyed_for_ann.text
            data = keyed_for_ann.json()["data"]
            assert data["salesperson_id"] == str(ann.id) and data["created_by"] == str(owner.id) and data["salesperson_name"] == "Ann"
            own = (await c.post(f"{API}/sales/orders", json=sale(1))).json()["data"]
            assert own["salesperson_id"] == str(owner.id)  # no salesperson sent: whoever entered it
            stranger = await c.post(f"{API}/sales/orders", json=sale(1, salesperson_id=str(uuid.uuid4())))
            assert stranger.status_code == 422
            await c.post(f"{API}/sales/orders", json=sale(3, salesperson_id=str(ben.id)))
            only_ann = (await c.get(f"{API}/sales/orders", params={"salesperson_id": str(ann.id)})).json()["data"]["items"]
            assert [o["id"] for o in only_ann] == [data["id"]]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_report_totals_per_salesperson_match_the_orders_and_keep_money_figures_apart(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    try:
        async with client(owner) as c:
            await c.post(f"{API}/sales/orders", json=sale(2, salesperson_id=str(ann.id)))
            await c.post(f"{API}/sales/orders", json=sale(1, salesperson_id=str(ann.id), amount_paid=40, amount_tendered=40, customer_id=None, due_date=None))
            await c.post(f"{API}/sales/orders", json=sale(3, salesperson_id=str(ben.id)))
            report = (await c.get(f"{API}/reports/salespeople")).json()["data"]
            by_name = {p["salesperson"]: p for p in report["people"]}
            assert by_name["Ben"]["sales"] == 300.0 and by_name["Ben"]["collected"] == 300.0 and by_name["Ben"]["outstanding"] == 0
            assert by_name["Ann"]["orders"] >= 1
            assert report["totals"]["sales"] == round(sum(p["sales"] for p in report["people"]), 2)
            assert len(report["orders"]) == report["totals"]["orders"]
            one = (await c.get(f"{API}/reports/salespeople", params={"salesperson_id": str(ben.id)})).json()["data"]
            assert [p["salesperson"] for p in one["people"]] == ["Ben"] and len(one["orders"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_correcting_the_salesperson_needs_authority_and_leaves_money_alone(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    try:
        async with client(owner) as c:
            order = (await c.post(f"{API}/sales/orders", json=sale(2, salesperson_id=str(ann.id)))).json()["data"]
            bad = await c.patch(f"{API}/sales/orders/{order['id']}/salesperson", json={"salesperson_id": str(ben.id), "reason": "x"})
            assert bad.status_code == 422  # a reason is required
            fixed = await c.patch(f"{API}/sales/orders/{order['id']}/salesperson", json={"salesperson_id": str(ben.id), "reason": "Ben made this sale"})
            assert fixed.status_code == 200 and fixed.json()["data"]["salesperson_name"] == "Ben" and fixed.json()["data"]["total"] == order["total"]
        async with client(ann) as c:
            denied = await c.patch(f"{API}/sales/orders/{order['id']}/salesperson", json={"salesperson_id": str(ann.id), "reason": "mine now"})
            assert denied.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_own_sales_only_policy_is_off_by_default_and_scopes_a_salesperson_when_on(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    try:
        async with client(owner) as c:
            await c.post(f"{API}/sales/orders", json=sale(1, salesperson_id=str(ann.id)))
            theirs = (await c.post(f"{API}/sales/orders", json=sale(1, salesperson_id=str(ben.id)))).json()["data"]
        async with client(ann) as c:
            assert len((await c.get(f"{API}/sales/orders")).json()["data"]["items"]) == 2  # existing behaviour: policy off
        tenant.approval_rules = {"own_sales_only": True}
        await db.flush()
        async with client(ann) as c:
            listed = (await c.get(f"{API}/sales/orders")).json()["data"]["items"]
            assert len(listed) == 1 and listed[0]["salesperson_id"] == str(ann.id)
            assert (await c.get(f"{API}/sales/orders/{theirs['id']}")).status_code == 403
            assert (await c.get(f"{API}/reports/salespeople", params={"salesperson_id": str(ben.id)})).status_code == 403
            mine = (await c.get(f"{API}/reports/salespeople")).json()["data"]
            assert [p["salesperson"] for p in mine["people"]] == ["Ann"]
        async with client(owner) as c:
            assert len((await c.get(f"{API}/sales/orders")).json()["data"]["items"]) == 2
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_sales_team_lists_active_people_for_the_picker_without_user_admin_access(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    ben.is_active = False
    await db.flush()
    try:
        async with client(ann) as c:
            names = [m["name"] for m in (await c.get(f"{API}/sales/team")).json()["data"]]
            assert names == ["Ann", "Owner"]
        tenant.approval_rules = {"own_sales_only": True}
        await db.flush()
        async with client(ann) as c:
            assert [m["name"] for m in (await c.get(f"{API}/sales/team")).json()["data"]] == ["Ann"]
    finally:
        app.dependency_overrides.clear()
