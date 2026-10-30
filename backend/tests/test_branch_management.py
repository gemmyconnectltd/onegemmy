"""Branch Management: the directory, one branch's sales, staff scope, safeguards, history, limits and isolation."""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import get_db
from app.core.exceptions import QuotaExceededError, ValidationError
from app.core.security import create_access_token
from app.main import app
from app.modules.billing.repository import BillingRepository
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.order_payment import OrderPayment
from app.modules.tenants.models import Branch, Role, Tenant, User
from app.modules.tenants.schemas import BranchCreate, BranchUpdate
from app.modules.tenants.service import (
    branch_insight,
    create_branch,
    ensure_permissions_seeded,
    seed_default_roles,
    update_branch,
)

API = "/api/v1/tenants"
TODAY = datetime.now(UTC)


def plan(monkeypatch, *modules):
    sub = SimpleNamespace(terms={"modules": list(modules)}, plan_id=uuid.uuid4(), status="active", period_end=TODAY + timedelta(days=20))
    monkeypatch.setattr(BillingRepository, "subscription", AsyncMock(return_value=sub))
    monkeypatch.setattr(BillingRepository, "first_unpaid", AsyncMock(return_value=None))
    monkeypatch.setattr("app.modules.billing.worker.sync_usage", AsyncMock())


async def business(db, label="Branch"):
    key = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"{label} {key}", slug=f"{label.lower()}-{key}", is_active=True, subscription_status="active", currency="RWF", timezone="UTC")
    db.add(tenant)
    await db.flush()
    await ensure_permissions_seeded(db)
    await seed_default_roles(db, tenant.id)
    remera, kimironko = Branch(tenant_id=tenant.id, name="Remera", location="Kigali, Remera", is_main=True), Branch(tenant_id=tenant.id, name="Kimironko", location="Kigali")
    db.add_all([remera, kimironko])
    await db.flush()
    roles = {r.name: r for r in (await db.execute(select(Role).where(Role.tenant_id == tenant.id))).scalars().all()}
    owner = User(tenant_id=tenant.id, email=f"o{key}@x.test", hashed_password="x", full_name="Olive Owner", role="owner", is_superuser=True, is_active=True)
    cashier = User(tenant_id=tenant.id, email=f"c{key}@x.test", hashed_password="x", full_name="Cathy Cashier", role="member", role_id=roles["Cashier"].id,
                   branch_id=remera.id, branch_ids=[str(remera.id)], is_active=True)
    db.add_all([owner, cashier])
    await db.flush()
    return tenant, owner, cashier, remera, kimironko


async def sell(db, tenant, branch, amount, when=None, name="Widget", method="cash", status="Completed"):
    order = Order(tenant_id=tenant.id, order_number=uuid.uuid4().hex[:12], status=status, total=amount, base_total=amount, branch_id=branch.id, ordered_at=when or TODAY)
    db.add(order)
    await db.flush()
    db.add(OrderItem(order_id=order.id, product_name=name, unit_price=amount, quantity=1, line_total=amount))
    db.add(OrderPayment(tenant_id=tenant.id, order_id=order.id, branch_id=branch.id, reference=uuid.uuid4().hex[:12], amount=amount, payment_method=method, status="Completed", paid_at=when or TODAY))
    await db.flush()
    return order


def client(db, user):
    async def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    token = create_access_token(str(user.id), {"tenant_id": str(user.tenant_id)})
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {token}"})


@pytest.mark.db
async def test_directory_has_real_staff_and_sales_per_branch_and_filters_work(db):
    tenant, _, _, remera, kimironko = await business(db)
    await sell(db, tenant, remera, 1000)
    await sell(db, tenant, remera, 500)
    await sell(db, tenant, kimironko, 300)
    await sell(db, tenant, remera, 9999, status="Draft")  # not a sale
    kimironko.status = "inactive"
    await db.flush()
    ask = lambda **kw: branch_insight.directory(db, tenant, allowed=None, search=None, status=None, sort="name", direction="asc", start=None, end=None, offset=0, limit=25, **kw)
    everything = await ask()
    by = {r["name"]: r for r in everything["items"]}
    assert by["Remera"]["sales"] == Decimal(1500) and by["Remera"]["orders"] == 2 and by["Remera"]["staff"] == 1 and by["Remera"]["is_main"]
    assert by["Kimironko"]["sales"] == Decimal(300) and by["Kimironko"]["staff"] == 0
    s = everything["summary"]
    assert (s["total"], s["active"], s["inactive"], s["assigned_staff"], s["works_in_all_branches"]) == (2, 1, 1, 1, 1)  # the owner works everywhere
    assert s["sales"] == Decimal(1800) and s["orders"] == 3
    only = lambda **kw: branch_insight.directory(db, tenant, allowed=None, **{"search": None, "status": None, "sort": "name", "direction": "asc", "start": None, "end": None, "offset": 0, "limit": 25, **kw})
    assert [r["name"] for r in (await only(search="remera"))["items"]] == ["Remera"]
    assert [r["name"] for r in (await only(status="inactive"))["items"]] == ["Kimironko"]
    assert [r["name"] for r in (await only(sort="sales", direction="desc"))["items"]] == ["Remera", "Kimironko"]
    assert (await only(include_sales=False))["items"][0]["sales"] is None  # no permission to see sales: no number at all


@pytest.mark.db
async def test_a_restricted_person_only_sees_their_own_branches(db):
    tenant, _, _, remera, _ = await business(db)
    data = await branch_insight.directory(db, tenant, allowed=[remera.id], search=None, status=None, sort="name", direction="asc", start=None, end=None, offset=0, limit=25)
    assert [r["name"] for r in data["items"]] == ["Remera"] and data["summary"]["total"] == 1


@pytest.mark.db
async def test_branch_sales_compare_with_the_previous_period_and_ignore_other_branches_and_businesses(db):
    tenant, _, _, remera, kimironko = await business(db)
    other, _, _, other_remera, _ = await business(db, "Other")
    today = datetime.now(UTC).replace(hour=12)
    await sell(db, tenant, remera, 1000, today, "Phone", "cash")
    await sell(db, tenant, remera, 500, today, "Case", "momo")
    await sell(db, tenant, remera, 600, today - timedelta(days=3), "Phone", "cash")  # the 3 days before the 3-day window
    await sell(db, tenant, kimironko, 7000, today)
    await sell(db, other, other_remera, 8000, today)
    start = today.date() - timedelta(days=2)
    report = await branch_insight.branch_sales(db, tenant, remera.id, start, today.date())
    assert report["sales"] == Decimal(1500) and report["orders"] == 2 and report["average"] == Decimal(750)
    assert report["previous"]["sales"] == Decimal(600) and report["growth_pct"] == 150.0
    assert [p["name"] for p in report["top_products"]] == ["Phone", "Case"]
    assert {m["method"]: m["amount"] for m in report["payment_methods"]} == {"cash": Decimal(1000), "momo": Decimal(500)}
    assert report["trend"][-1]["sales"] == Decimal(1500) and len(report["recent_orders"]) == 2
    with pytest.raises(ValidationError):
        await branch_insight.branch_sales(db, tenant, remera.id, date(2020, 1, 1), today.date())  # more than a year


@pytest.mark.db
async def test_the_main_and_the_last_active_branch_cannot_be_deactivated(db, monkeypatch):
    plan(monkeypatch, "sales")
    tenant, _, _, remera, kimironko = await business(db)
    with pytest.raises(ValidationError, match="main branch"):
        await update_branch(db, tenant.id, remera.id, BranchUpdate(status="inactive"))
    await update_branch(db, tenant.id, kimironko.id, BranchUpdate(status="inactive"))
    other_main = Branch(tenant_id=tenant.id, name="Solo", is_main=False)
    db.add(other_main)
    await db.flush()
    remera.is_main = False  # now Remera is the last active one
    kimironko.status = "inactive"
    other_main.status = "inactive"
    await db.flush()
    with pytest.raises(ValidationError, match="only active branch"):
        await update_branch(db, tenant.id, remera.id, BranchUpdate(status="inactive"))


@pytest.mark.db
async def test_the_plan_branch_limit_is_enforced_when_creating(db, monkeypatch):
    plan(monkeypatch, "sales")
    tenant, *_ = await business(db)
    tenant.limits = {"max_branches": 2}
    await db.flush()
    monkeypatch.setattr(BillingRepository, "tenant", AsyncMock(return_value=tenant))
    monkeypatch.setattr(BillingRepository, "subscription", AsyncMock(return_value=None))
    with pytest.raises(QuotaExceededError, match="limit reached"):
        await create_branch(db, tenant.id, BranchCreate(name="Third"))


@pytest.mark.db
async def test_changes_are_recorded_and_visible_in_the_activity_and_the_api_stays_inside_the_business(db, monkeypatch):
    plan(monkeypatch, "sales")
    _, owner, cashier, remera, kimironko = await business(db)
    _, _, _, foreign, _ = await business(db, "Foreign")
    try:
        async with client(db, owner) as admin:
            edited = await admin.patch(f"{API}/branches/{kimironko.id}", json={"phone": "0788"})
            assert edited.status_code == 200, edited.text
            assert (await admin.patch(f"{API}/branches/{kimironko.id}", json={"status": "inactive"})).status_code == 200
            blocked = await admin.patch(f"{API}/branches/{remera.id}", json={"status": "inactive"})
            assert blocked.status_code == 422 and "main branch" in blocked.json()["message"]
            activity = (await admin.get(f"{API}/branches/{kimironko.id}/activity")).json()["data"]
            assert [a["action"] for a in activity][:2] == ["branch.status", "branch.update"]
            assert activity[0]["actor"] == "Olive Owner" and "deactivated" in activity[0]["summary"]
            assert (await admin.get(f"{API}/branches/{foreign.id}/activity")).status_code == 404
            assert (await admin.get(f"{API}/branches/{foreign.id}/sales")).status_code == 404
            overview = await admin.get(f"{API}/branches/overview?status=active")
            assert overview.status_code == 200 and [i["name"] for i in overview.json()["data"]["items"]] == ["Remera"]
            assert overview.json()["data"]["summary"]["total"] == 2
        async with client(db, cashier) as till:
            assert (await till.get(f"{API}/branches/overview")).status_code == 403  # a cashier holds no branches permission
            assert (await till.patch(f"{API}/branches/{remera.id}", json={"phone": "1"})).status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_branches_staff_list_names_only_people_assigned_to_it(db):
    from app.modules.tenants.service import access
    tenant, _, cashier, remera, kimironko = await business(db)
    page = lambda branch: access.access_summary(db, tenant.id, search=None, role_id=None, branch_id=branch.id, status=None, offset=0, limit=25, assigned_only=True)
    assert [r["email"] for r in (await page(remera))["items"]] == [cashier.email]  # the owner works everywhere but is not "assigned"
    assert (await page(kimironko))["items"] == []


@pytest.mark.db
async def test_a_stock_transfer_needs_two_different_places(db):
    from app.core.exceptions import ValidationError as Invalid
    from app.modules.inventory.schemas import StockTransferCreate
    from app.modules.inventory.service import transfer
    tenant, owner, _, remera, _ = await business(db)
    item = {"product_name": "Charger", "quantity": 1}
    for a, b in [(remera.id, remera.id), (None, None)]:  # a branch to itself, and main store to main store
        with pytest.raises(Invalid, match="different places"):
            await transfer.create_transfer(db, tenant.id, owner.id, StockTransferCreate(from_branch_id=a, to_branch_id=b, items=[item]))
