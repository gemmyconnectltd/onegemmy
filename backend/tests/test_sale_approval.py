"""Business policy: every sale is approved before it is paid or leaves stock. Off unless the business switches it on."""
import uuid

import pytest

from app.main import app
from app.modules.tenants.models import User
from tests.test_sales_team import API, team


async def stock(db, product_id):
    from app.modules.inventory.models.product import Product
    return float((await db.get(Product, product_id, populate_existing=True)).stock)


@pytest.mark.db
async def test_nothing_changes_for_a_business_that_has_not_switched_the_policy_on(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    try:
        async with client(ann) as c:
            made = await c.post(f"{API}/sales/orders", json=sale(1))
            assert made.status_code == 201 and made.json()["data"]["status"] == "Completed"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_with_the_policy_on_a_sale_waits_unpaid_and_unissued_until_an_approver_decides(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    tenant.approval_rules = {"sale_approval": True}
    await db.flush()
    try:
        async with client(ann) as c:
            body = sale(2)
            made = await c.post(f"{API}/sales/orders", json=body)
            assert made.status_code == 201, made.text
            held = made.json()["data"]
            assert held["status"] == "Awaiting Approval" and held["held_reason"] == "policy" and held["amount_paid"] == 0
            product_id = held["items"][0]["product_id"]
            assert await stock(db, uuid.UUID(product_id)) == 100  # nothing issued yet
            # no way round the approval: not by payment, not by flipping the status, not by approving it yourself
            assert (await c.post(f"{API}/sales/orders/{held['id']}/payments", json={"amount": 100, "payment_method": "cash", "method": "cash"})).status_code >= 400
            assert (await c.patch(f"{API}/sales/orders/{held['id']}", json={"status": "Completed"})).status_code >= 400
            assert (await c.post(f"{API}/sales/orders/{held['id']}/approve", json={})).status_code == 403
            pending = (await c.get(f"{API}/sales/orders", params={"status": "Awaiting Approval"})).json()["data"]["items"]
            assert [o["id"] for o in pending] == [held["id"]]
            # the same sale replayed (a retry) is the same held sale, not a second one
            replay = await c.post(f"{API}/sales/orders", json=body)
            assert replay.json()["data"]["id"] == held["id"]
        async with client(owner) as c:
            approved = await c.post(f"{API}/sales/orders/{held['id']}/approve", json={"note": "ok"})
            assert approved.status_code == 200, approved.text
            data = approved.json()["data"]
            assert data["status"] == "Completed" and data["approved_by"] == str(owner.id) and data["created_by"] == str(ann.id)
            assert await stock(db, uuid.UUID(product_id)) == 98
            again = await c.post(f"{API}/sales/orders/{held['id']}/approve", json={})
            assert again.status_code == 422
            assert await stock(db, uuid.UUID(product_id)) == 98  # a second approval issued nothing more
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_rejection_needs_a_reason_and_a_rejected_sale_can_never_be_paid_or_approved(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    tenant.approval_rules = {"sale_approval": True}
    await db.flush()
    try:
        async with client(ann) as c:
            held = (await c.post(f"{API}/sales/orders", json=sale(1))).json()["data"]
        async with client(owner) as c:
            assert (await c.post(f"{API}/sales/orders/{held['id']}/reject", json={})).status_code == 422
            rejected = await c.post(f"{API}/sales/orders/{held['id']}/reject", json={"note": "Price too low"})
            assert rejected.status_code == 200 and rejected.json()["data"]["status"] == "Rejected"
            assert (await c.post(f"{API}/sales/orders/{held['id']}/approve", json={})).status_code == 422
            assert (await c.post(f"{API}/sales/orders/{held['id']}/payments", json={"amount": 100, "payment_method": "cash", "method": "cash"})).status_code >= 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_an_approver_may_complete_their_own_sale_unless_the_business_forbids_it(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    tenant.approval_rules = {"sale_approval": True}
    await db.flush()
    other = User(tenant_id=tenant.id, full_name="Second approver", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True, is_superuser=True, role="owner")
    db.add(other)
    await db.flush()
    try:
        async with client(owner) as c:
            assert (await c.post(f"{API}/sales/orders", json=sale(1))).json()["data"]["status"] == "Completed"
        tenant.approval_rules = {"sale_approval": True, "sale_no_self_approval": True}
        await db.flush()
        async with client(owner) as c:
            mine = (await c.post(f"{API}/sales/orders", json=sale(1))).json()["data"]
            assert mine["status"] == "Awaiting Approval"
            assert (await c.post(f"{API}/sales/orders/{mine['id']}/approve", json={})).status_code == 403
        async with client(other) as c:
            assert (await c.post(f"{API}/sales/orders/{mine['id']}/approve", json={})).status_code == 200
    finally:
        app.dependency_overrides.clear()
