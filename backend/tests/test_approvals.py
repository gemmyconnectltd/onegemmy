"""Requests and approvals: price changes, stock corrections and stock transfers need a decision from someone with authority."""
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import create_access_token
from app.main import app
from app.modules.approvals.models import ApprovalRequest
from app.modules.billing.repository import BillingRepository
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.transfer import StockTransfer
from app.modules.tenants.models import Branch, Permission, Role, Tenant, User
from app.modules.tenants.service import ensure_permissions_seeded, seed_default_roles

API = "/api/v1/tenants"


@pytest.fixture(autouse=True)
def quiet(monkeypatch):
    sub = SimpleNamespace(terms={"modules": []}, plan_id=uuid.uuid4(), status="active", period_end=datetime.now(UTC) + timedelta(days=20))
    monkeypatch.setattr(BillingRepository, "subscription", AsyncMock(return_value=sub))
    monkeypatch.setattr(BillingRepository, "first_unpaid", AsyncMock(return_value=None))
    monkeypatch.setattr("app.modules.billing.worker.sync_usage", AsyncMock())
    sent = []

    async def fake(to, subject, title, body_html, preheader="", sender="admin"):
        sent.append((to, subject))
        return True

    monkeypatch.setattr("app.core.email.send_notice_email", fake)
    return sent


async def people(db):
    key = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"Appr {key}", slug=f"appr-{key}", is_active=True, subscription_status="active", currency="RWF")
    db.add(tenant)
    await db.flush()
    await ensure_permissions_seeded(db)
    await seed_default_roles(db, tenant.id)
    await db.flush()
    catalog = {p.name: p for p in (await db.execute(select(Permission))).scalars().all()}
    roles = {r.name: r for r in (await db.execute(select(Role).where(Role.tenant_id == tenant.id))).scalars().all()}
    ops = Role(tenant_id=tenant.id, name="Operations Manager", permissions=[catalog[n] for n in ("approvals:approve", "approvals:read", "items:read", "items:update")])
    db.add(ops)
    await db.flush()
    kabuga = Branch(tenant_id=tenant.id, name="Kabuga", is_main=True)
    db.add(kabuga)
    await db.flush()

    def user(email, role, **kw):
        return User(tenant_id=tenant.id, email=f"{email}{key}@x.test", hashed_password="x", full_name=email.title(), role="member", role_id=role.id, is_active=True, **kw)

    manager = user("manager", roles["Branch Manager"], branch_id=kabuga.id, branch_ids=[str(kabuga.id)])
    ops_user = user("ops", ops)
    till = user("till", roles["Cashier"])
    roaming = user("roaming", roles["Branch Manager"])  # a branch manager with no branch limit
    gm = user("gm", roles["General Manager"])
    owner = User(tenant_id=tenant.id, email=f"owner{key}@x.test", hashed_password="x", full_name="Owner", role="owner", is_superuser=True, is_active=True)
    db.add_all([manager, ops_user, gm, owner, till, roaming])
    product = Product(tenant_id=tenant.id, name="Charger", price=10000, cost=5000, stock=10)
    db.add(product)
    await db.flush()
    return tenant, manager, ops_user, gm, owner, product, kabuga, till, roaming


def client(db, user):
    async def _db():
        yield db

    app.dependency_overrides[get_db] = _db
    token = create_access_token(str(user.id), {"tenant_id": str(user.tenant_id)})
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=True), base_url="http://t", headers={"Authorization": f"Bearer {token}"})


@pytest.mark.db
async def test_a_branch_manager_cannot_change_price_or_stock_directly_but_can_ask(db, quiet):
    _, manager, ops, gm, _, product, kabuga, _, roaming = await people(db)
    try:
        async with client(db, manager) as c:
            blocked = await c.patch(f"{API}/inventory/products/{product.id}", json={"price": 12000})
            assert blocked.status_code == 409 and "needs approval" in blocked.json()["message"]
            assert (await c.patch(f"{API}/inventory/products/{product.id}", json={"stock": 99})).status_code == 403  # a branch-limited person has no direct stock access at all
            assert (await c.patch(f"{API}/inventory/products/{product.id}", json={"price": 10000, "name": "Charger 65W"})).status_code == 200  # an unchanged price still saves
            asked = await c.post(f"{API}/approvals", json={"kind": "price_change", "subject_id": str(product.id), "new_price": 12000, "reason": "Supplier raised the cost", "branch_id": str(kabuga.id)})
            assert asked.status_code == 201, asked.text
            assert asked.json()["data"]["payload"]["old_price"] == 10000
            again = await c.post(f"{API}/approvals", json={"kind": "price_change", "subject_id": str(product.id), "new_price": 12500, "reason": "Another try please"})
            assert again.status_code == 409  # one request at a time for the same thing
            assert (await c.post(f"{API}/approvals", json={"kind": "stock_adjustment", "subject_id": str(product.id), "new_stock": 7, "reason": "x"})).status_code == 422  # a reason is required
            req_id = asked.json()["data"]["id"]
        async with client(db, roaming) as c:  # without a branch limit the same edits reach the approval rule instead
            assert (await c.patch(f"{API}/inventory/products/{product.id}", json={"price": 12000})).status_code == 409
            assert (await c.patch(f"{API}/inventory/products/{product.id}", json={"stock": 99})).status_code == 409
        async with client(db, manager) as c:
            assert (await c.post(f"{API}/approvals/{req_id}/approve")).status_code == 403  # no authority
        assert any(to == ops.email and subject.startswith("Approval needed: New price for Charger") for to, subject in quiet)  # the approver was emailed
        async with client(db, ops) as c:
            inbox = (await c.get(f"{API}/approvals?status=pending")).json()["data"]
            assert inbox["total"] == 1 and inbox["items"][0]["requested_by"] == "Manager"
            assert (await c.post(f"{API}/approvals/{req_id}/reject")).status_code == 422  # a rejection needs a reason
            done = await c.post(f"{API}/approvals/{req_id}/approve", json={"note": "OK"})
            assert done.status_code == 200 and done.json()["data"]["status"] == "approved"
            assert (await c.post(f"{API}/approvals/{req_id}/approve")).status_code == 409  # already decided
        await db.refresh(product)
        assert float(product.price) == 12000
        assert any(to == gm.email for to, _ in quiet) and any(to == manager.email for to, _ in quiet)  # the GM and the requester were told
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_nobody_decides_their_own_request_and_rejection_changes_nothing(db):
    _, _, ops, _, owner, product, *_ = await people(db)
    try:
        async with client(db, ops) as c:
            ops.role_id = ops.role_id  # authority holder who also asks
            made = await c.post(f"{API}/approvals", json={"kind": "stock_adjustment", "subject_id": str(product.id), "new_stock": 4, "reason": "Recount after audit"})
            assert made.status_code == 201
            rid = made.json()["data"]["id"]
            own = await c.post(f"{API}/approvals/{rid}/approve")
            assert own.status_code == 403 and "own request" in own.json()["message"]
        async with client(db, owner) as c:  # the owner may decide, and a rejection leaves the stock alone
            rejected = await c.post(f"{API}/approvals/{rid}/reject", json={"note": "Count again with a witness"})
            assert rejected.status_code == 200 and rejected.json()["data"]["status"] == "rejected"
        await db.refresh(product)
        assert float(product.stock) == 10
        async with client(db, owner) as c:
            made = await c.post(f"{API}/approvals", json={"kind": "stock_adjustment", "subject_id": str(product.id), "new_stock": 6, "reason": "Recount after audit"})
            rid = made.json()["data"]["id"]
            assert (await c.post(f"{API}/approvals/{rid}/approve", json={"note": "Verified"})).status_code == 200
        await db.refresh(product)
        assert float(product.stock) == 6  # an approved correction is applied and audited
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_transfer_made_by_a_branch_manager_waits_for_approval(db):
    tenant, manager, ops, _, _, product, kabuga, _, roaming = await people(db)
    other = Branch(tenant_id=tenant.id, name="Rubavu")
    db.add(other)
    await db.flush()
    body = {"from_branch_id": str(kabuga.id), "to_branch_id": str(other.id), "items": [{"product_id": str(product.id), "product_name": "Charger", "quantity": 2}]}
    try:
        async with client(db, manager) as c:  # limited to Kabuga: may start a transfer involving Kabuga, nothing else about transfers
            made = await c.post(f"{API}/inventory/transfers", json=body)
            assert made.status_code == 201 and made.json()["data"]["approval_request_id"]
            assert (await c.patch(f"{API}/inventory/transfers/{made.json()['data']['id']}", json={"status": "completed"})).status_code == 403
            elsewhere = await c.post(f"{API}/inventory/transfers", json={**body, "from_branch_id": str(other.id), "to_branch_id": None})
            assert elsewhere.status_code == 403  # not one of their branches
        async with client(db, roaming) as c:  # no branch limit, no approval authority
            made = await c.post(f"{API}/inventory/transfers", json=body)
            transfer_id, request_id = made.json()["data"]["id"], made.json()["data"]["approval_request_id"]
            stuck = await c.patch(f"{API}/inventory/transfers/{transfer_id}", json={"status": "completed"})
            assert stuck.status_code == 409 and "waiting for approval" in stuck.json()["message"]
        async with client(db, ops) as c:
            assert (await c.post(f"{API}/approvals/{request_id}/approve")).status_code == 200
        async with client(db, roaming) as c:
            moved = await c.patch(f"{API}/inventory/transfers/{transfer_id}", json={"status": "completed"})
            assert moved.status_code == 200, moved.text
        await db.refresh(product)
        assert float(product.stock) == 10  # one global quantity: out of one branch, into the other
        assert (await db.get(StockTransfer, uuid.UUID(transfer_id))).status == "completed"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_people_only_see_their_own_requests_and_cannot_touch_other_businesses(db):
    _, manager, _, _, _, product, _, till, _ = await people(db)
    _, other_manager, *_ = await people(db)
    try:
        async with client(db, manager) as c:
            made = await c.post(f"{API}/approvals", json={"kind": "price_change", "subject_id": str(product.id), "new_price": 11000, "reason": "Competitor price"})
            rid = made.json()["data"]["id"]
        async with client(db, till) as c:  # holds neither authority nor inbox permission, and asked for nothing
            assert (await c.get(f"{API}/approvals")).json()["data"]["total"] == 0
        async with client(db, other_manager) as c:
            assert (await c.post(f"{API}/approvals/{rid}/cancel")).status_code == 404  # another business's request does not exist for them
            foreign = await c.post(f"{API}/approvals", json={"kind": "price_change", "subject_id": str(product.id), "new_price": 1, "reason": "Not my product"})
            assert foreign.status_code == 404
        async with client(db, manager) as c:
            assert (await c.post(f"{API}/approvals/{rid}/cancel")).json()["data"]["status"] == "cancelled"
        assert (await db.execute(select(ApprovalRequest).where(ApprovalRequest.id == uuid.UUID(rid)))).scalar_one().status == "cancelled"
    finally:
        app.dependency_overrides.clear()


async def test_branch_manager_template_never_carries_approval_authority():
    from app.modules.tenants.service.role import _ADMIN_ONLY_RESOURCES
    assert "approvals" in _ADMIN_ONLY_RESOURCES  # so no template (Branch Manager, Member ...) can approve what its holders ask for
