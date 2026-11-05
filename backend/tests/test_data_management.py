"""Super Admin Data Management: permissions, tenant isolation, impact analysis, approval, safe execution and history.

Every destructive step here runs against disposable fixtures created inside the test."""
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

from app.core.security import create_access_token
from app.main import app
from app.modules.admin.data_management.models import DataOperation
from app.modules.admin.data_management.permissions import ALL
from app.modules.inventory.models.product import Product
from app.modules.sales.models.customer import Customer
from app.modules.tenants.models import User
from tests.test_sales_team import API, team

DM = "/api/v1/admin/data-management"


async def platform_admin(db, name, permissions):
    user = User(email=f"{name}-{uuid.uuid4().hex[:6]}@example.com", hashed_password="x", full_name=name, role="superadmin", is_superuser=True, is_active=True, tenant_id=None,
                platform_permissions=list(permissions))
    db.add(user)
    await db.flush()
    return user


def as_admin(user):
    token = create_access_token(str(user.id), {})
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {token}"})


async def world(db, monkeypatch):
    """A business with: a customer who bought something, a customer who did not, a product that sold, a product that did not, a paid sale and a draft sale."""
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    tenant.timezone = "Africa/Kigali"
    tenant.name = "Kigali Traders"
    sold_to = Customer(tenant_id=tenant.id, name="Buyer Ltd", email="buyer@x.test")
    spare = Customer(tenant_id=tenant.id, name="Spare Customer")
    unsold = Product(tenant_id=tenant.id, name="Unsold item", sku="UNSOLD", price=5, cost=2, stock=0)
    db.add_all([sold_to, spare, unsold])
    await db.flush()
    product = (await db.execute(select(Product).where(Product.tenant_id == tenant.id, Product.name == "Widget"))).scalars().first()
    async with client(owner) as c:
        paid = (await c.post(f"{API}/sales/orders", json={**sale(2), "customer_id": str(sold_to.id)})).json()["data"]
        draft = (await c.post(f"{API}/sales/orders", json={"status": "Pending", "client_order_id": uuid.uuid4().hex, "items": [{"product_id": str(product.id), "product_name": product.name, "unit_price": 100, "quantity": 1}]})).json()["data"]
    return tenant, owner, sold_to, spare, product, unsold, paid, draft


def selection(*ids):
    return {"mode": "ids", "ids": [str(i) for i in ids]}


async def run(c, tenant, module, operation, sel, payload=None, reason="Cleaning up after the trial period ended"):
    prepared = await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": module, "operation": operation, "selection": sel, "payload": payload or {}})
    assert prepared.status_code == 201, prepared.text
    return prepared.json()["data"]


@pytest.mark.db
async def test_nobody_gets_data_permissions_automatically_and_business_users_never_reach_it(db, monkeypatch):
    tenant, owner, *_ = await world(db, monkeypatch)
    bare = await platform_admin(db, "Bare", [])
    try:
        async with as_admin(bare) as c:
            assert (await c.get(f"{DM}/me")).json()["data"]["permissions"] == []
            for method, path in [("GET", f"/businesses/{tenant.id}/modules"), ("GET", "/operations"), ("GET", f"/businesses/{tenant.id}/recovery"), ("GET", "/businesses")]:
                assert (await c.request(method, DM + path)).status_code == 403, path
            assert (await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": "sales", "operation": "archive", "selection": selection(uuid.uuid4())})).status_code == 403
        token = create_access_token(str(owner.id), {"tenant_id": str(tenant.id)})  # a business owner, even a superuser inside their own business
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers={"Authorization": f"Bearer {token}"}) as c:
            assert (await c.get(f"{DM}/businesses/{tenant.id}/modules")).status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_explorer_shows_real_counts_filters_by_date_type_in_the_business_timezone_and_selects_every_match(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    viewer = await platform_admin(db, "Viewer", ["data:view"])
    for n in range(28):
        db.add(Customer(tenant_id=tenant.id, name=f"Bulk {n:02d}"))
    await db.flush()
    try:
        async with as_admin(viewer) as c:
            counts = {m["key"]: m for m in (await c.get(f"{DM}/businesses/{tenant.id}/modules")).json()["data"]}
            assert counts["customers"]["count"] == 30 and counts["sales"]["count"] == 2
            assert counts["sales"]["operations"] == ["archive", "delete", "clean_test", "correct"] and counts["stock_movements"]["operations"] == []
            page = (await c.post(f"{DM}/businesses/{tenant.id}/modules/customers/records", json={"page": 2, "page_size": 10, "sort": "reference", "descending": False})).json()["data"]
            assert page["total"] == 30 and len(page["items"]) == 10 and page["page"] == 2
            found = (await c.post(f"{DM}/businesses/{tenant.id}/modules/customers/records", json={"filters": {"search": "bulk 1"}})).json()["data"]
            assert found["total"] == 10
            # sale date vs created date: back-date a sale to 23:30 UTC on Nov 4 = 01:30 on Nov 5 in Kigali (UTC+2)
            from app.modules.sales.models.order import Order
            order = await db.get(Order, uuid.UUID(draft["id"]))
            order.ordered_at = datetime(2026, 11, 4, 23, 30, tzinfo=UTC)
            await db.flush()
            q = lambda f: c.post(f"{DM}/businesses/{tenant.id}/modules/sales/records", json={"filters": f})
            on_day = (await q({"date_type": "transaction", "from": "2026-11-05", "to": "2026-11-05"})).json()["data"]
            assert draft["order_number"] in [r["reference"] for r in on_day["items"]] and on_day["date_type"] == "transaction" and on_day["timezone"] == "Africa/Kigali"
            day_before = (await q({"date_type": "transaction", "from": "2026-11-04", "to": "2026-11-04"})).json()["data"]
            assert draft["order_number"] not in [r["reference"] for r in day_before["items"]]
            assert (await q({"date_type": "bogus"})).status_code == 422 and (await q({"nonsense": 1})).status_code == 422
            assert (await c.post(f"{DM}/businesses/{tenant.id}/modules/customers/records", json={"filters": {"date_type": "transaction"}})).status_code == 422  # customers have no sale date
            status = (await q({"payment_status": "Paid"})).json()["data"]
            assert [r["reference"] for r in status["items"]] == [paid["order_number"]]
        # "all 30 matching" is one plan, not the 10 on screen
        preparer = await platform_admin(db, "Preparer", ["data:view", "data:preview"])
        async with as_admin(preparer) as c:
            plan = await run(c, tenant, "customers", "archive", {"mode": "matching", "filters": {"search": "bulk"}, "excluded_ids": []}, {"confirm_all_dates": True})
            assert plan["summary"]["selected"] == 28 and plan["summary"]["eligible"] == 28
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_archive_keeps_history_and_the_selection_is_exactly_what_was_previewed(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    admin = await platform_admin(db, "Archiver", ["data:view", "data:preview", "data:request", "data:execute", "data:history"])
    try:
        async with as_admin(admin) as c:
            plan = await run(c, tenant, "customers", "archive", selection(sold_to.id))
            assert plan["status"] == "Prepared" and not plan["approval_required"] and plan["summary"] == {"selected": 1, "eligible": 1, "blocked": 0}
            assert (await c.post(f"{DM}/operations/{plan['id']}/execute", json={})).status_code == 409  # not submitted yet
            assert (await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "short"})).status_code == 422
            submitted = (await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "Customer asked to be removed from lists"})).json()["data"]
            assert submitted["status"] == "Approved"
            done = (await c.post(f"{DM}/operations/{plan['id']}/execute", json={"idempotency_key": "k1"})).json()["data"]
            assert done["status"] == "Completed" and done["affected"] == 1
            await db.refresh(sold_to)
            assert sold_to.is_active is False
            from app.modules.sales.models.order import Order
            assert (await db.get(Order, uuid.UUID(paid["id"]))).customer_id == sold_to.id  # the invoice still names the customer
            again = (await c.post(f"{DM}/operations/{plan['id']}/execute", json={"idempotency_key": "k2"})).json()["data"]
            assert again["replayed"] is True and again["affected"] == 1
            # archiving a paid sale keeps its payment and its journal
            sale_plan = await run(c, tenant, "sales", "archive", selection(paid["id"]))
            await c.post(f"{DM}/operations/{sale_plan['id']}/submit", json={"reason": "Hide this one from the daily list"})
            await c.post(f"{DM}/operations/{sale_plan['id']}/execute", json={})
            order = await db.get(Order, uuid.UUID(paid["id"]), populate_existing=True)
            assert order.archived_at is not None and float(order.amount_paid) == 200 and order.status == "Completed"
            # archiving something already archived is blocked, with the reason
            blocked = await run(c, tenant, "customers", "archive", selection(sold_to.id))
            assert blocked["summary"]["eligible"] == 0 and "already inactive" in blocked["analysis"]["assessments"][0]["reasons"][0]
            assert (await c.post(f"{DM}/operations/{blocked['id']}/submit", json={"reason": "Trying anyway to archive it"})).status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_delete_removes_only_what_has_no_history_and_explains_every_block(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    requester = await platform_admin(db, "Requester", ["data:view", "data:preview", "data:request", "data:execute", "data:history"])
    approver = await platform_admin(db, "Approver", ["data:view", "data:approve", "data:history"])
    try:
        async with as_admin(requester) as c:
            plan = await run(c, tenant, "sales", "delete", selection(paid["id"], draft["id"]))
            assert plan["summary"] == {"selected": 2, "eligible": 1, "blocked": 1}
            blocked = next(a for a in plan["analysis"]["assessments"] if not a["eligible"])
            assert blocked["id"] == paid["id"] and any("paid or posted" in r for r in blocked["reasons"]) and "Void" in blocked["alternative"]
            cust = await run(c, tenant, "customers", "delete", selection(sold_to.id, spare.id))
            reasons = next(a for a in cust["analysis"]["assessments"] if a["id"] == str(sold_to.id))["reasons"]
            assert cust["summary"]["eligible"] == 1 and any("sales" in r and "Used by" in r for r in reasons)
            prod = await run(c, tenant, "products", "delete", selection(product.id, unsold.id))
            assert prod["summary"]["eligible"] == 1 and next(a for a in prod["analysis"]["assessments"] if a["id"] == str(product.id))["alternative"].startswith("Archive")
            assert any("No backup" in r for r in plan["restrictions"])

            # approval: needed, never by the requester, exact plan only
            assert plan["approval_required"] is True
            sub = (await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "Removing the abandoned draft sale"})).json()["data"]
            assert sub["status"] == "PendingApproval"
            assert (await c.post(f"{DM}/operations/{plan['id']}/execute", json={})).status_code == 409
            assert (await c.post(f"{DM}/operations/{plan['id']}/decision", json={"approve": True})).status_code == 403  # no approve permission
        requester_with_approve = await platform_admin(db, "Both", ["data:approve"])
        async with as_admin(requester_with_approve) as c:
            pass
        async with as_admin(approver) as c:
            assert (await c.post(f"{DM}/operations/{plan['id']}/decision", json={"approve": False})).status_code == 422  # rejecting needs a reason
            approved = (await c.post(f"{DM}/operations/{plan['id']}/decision", json={"approve": True, "note": "Checked with the owner"})).json()["data"]
            assert approved["status"] == "Approved" and approved["decided_by"] == "Approver"
        async with as_admin(requester) as c:
            assert (await c.post(f"{DM}/operations/{plan['id']}/execute", json={})).status_code == 422  # typed confirmation missing
            assert (await c.post(f"{DM}/operations/{plan['id']}/execute", json={"confirm": {"business_name": "Kigali Traders", "reference": "DM-WRONG"}})).status_code == 422
            done = (await c.post(f"{DM}/operations/{plan['id']}/execute", json={"idempotency_key": "d1", "confirm": {"business_name": "kigali traders", "reference": plan["reference"]}})).json()["data"]
            assert done["status"] == "Completed" and done["affected"] == 1
            from app.modules.sales.models.order import Order
            assert await db.get(Order, uuid.UUID(draft["id"]), populate_existing=True) is None
            assert await db.get(Order, uuid.UUID(paid["id"]), populate_existing=True) is not None  # the paid sale is untouched
            items = (await c.get(f"{DM}/operations/{plan['id']}/items")).json()["data"]["items"]
            assert [i["outcome"] for i in items] == ["affected"] and items[0]["snapshot"]["label"] == draft["order_number"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_nobody_approves_their_own_request_and_changed_or_stale_plans_are_refused(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    both = await platform_admin(db, "Both", list(ALL))
    other = await platform_admin(db, "Other", ["data:approve", "data:view"])
    try:
        async with as_admin(both) as c:
            assert (await c.put(f"{DM}/settings", json={"require_second_approver": True})).status_code == 200
            plan = await run(c, tenant, "customers", "delete", selection(spare.id))
            await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "This customer was created by mistake"})
            assert (await c.post(f"{DM}/operations/{plan['id']}/decision", json={"approve": True})).status_code == 403  # separation of duties
        async with as_admin(other) as c:
            assert (await c.post(f"{DM}/operations/{plan['id']}/decision", json={"approve": True})).status_code == 200
        # tamper: the records behind an approved plan change -> the plan no longer matches what was approved
        row = await db.get(DataOperation, uuid.UUID(plan["id"]), populate_existing=True)
        row.record_ids = [str(sold_to.id)]
        await db.flush()
        async with as_admin(both) as c:
            r = await c.post(f"{DM}/operations/{plan['id']}/execute", json={"confirm": {"business_name": "Kigali Traders", "reference": plan["reference"]}})
            assert r.status_code == 409 and "no longer matches" in r.json()["message"]
        await db.refresh(sold_to)
        assert await db.get(Customer, sold_to.id) is not None
        # a plan not submitted within the hour is stale
        async with as_admin(both) as c:
            stale = await run(c, tenant, "customers", "archive", selection(spare.id))
            row = await db.get(DataOperation, uuid.UUID(stale["id"]), populate_existing=True)
            row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
            await db.flush()
            expired = await c.post(f"{DM}/operations/{stale['id']}/submit", json={"reason": "Submitting far too late for this"})
            assert expired.status_code == 409 and "expired" in expired.json()["message"]
            # a record changed after the preview is left alone
            fresh = await run(c, tenant, "customers", "archive", selection(spare.id))
            await c.post(f"{DM}/operations/{fresh['id']}/submit", json={"reason": "Archiving the spare customer now"})
            spare.name = "Spare Customer (edited)"
            spare.updated_at = datetime.now(UTC) + timedelta(seconds=5)
            await db.flush()
            done = (await c.post(f"{DM}/operations/{fresh['id']}/execute", json={})).json()["data"]
            assert done["status"] == "Failed" and done["result"]["counts"]["skipped"] == 1
            await db.refresh(spare)
            assert spare.is_active is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_clean_test_data_needs_a_reviewed_selection_and_never_touches_real_financial_history(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    both = await platform_admin(db, "Both", list(ALL))
    other = await platform_admin(db, "Other", ["data:approve"])
    try:
        async with as_admin(both) as c:
            plan = await run(c, tenant, "sales", "clean_test", selection(paid["id"], draft["id"]))
            assert plan["summary"]["eligible"] == 1 and any("not recognised as test data automatically" in r for r in plan["restrictions"])
            no_attest = await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "Trial business cleanup, reviewed"})
            assert no_attest.status_code == 422 and "test data" in no_attest.json()["message"]
            await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "Trial business cleanup, reviewed", "attest_test_data": True})
        async with as_admin(other) as c:
            await c.post(f"{DM}/operations/{plan['id']}/decision", json={"approve": True})
        async with as_admin(both) as c:
            done = (await c.post(f"{DM}/operations/{plan['id']}/execute", json={"confirm": {"business_name": "Kigali Traders", "reference": plan["reference"]}})).json()["data"]
            assert done["affected"] == 1
            from app.modules.sales.models.order import Order
            assert await db.get(Order, uuid.UUID(paid["id"]), populate_existing=True) is not None
            # old, small or oddly named records are NOT treated as test data on their own
            assert (await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": "accounting", "operation": "clean_test", "selection": selection(uuid.uuid4())})).status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_correct_shows_before_and_after_and_goes_through_the_module_workflow(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    both = await platform_admin(db, "Both", list(ALL))
    other = await platform_admin(db, "Other", ["data:approve"])
    try:
        async with as_admin(both) as c:
            plan = await run(c, tenant, "customers", "correct", selection(sold_to.id), {"fields": {"phone": "+250788000111", "email": "new@buyer.test"}})
            changes = {x["field"]: x for x in plan["analysis"]["assessments"][0]["changes"]}
            assert changes["email"]["before"] == "buyer@x.test" and changes["email"]["after"] == "new@buyer.test" and changes["phone"]["before"] is None
            await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "Customer sent new contact details"})
            assert (await c.post(f"{DM}/operations/{plan['id']}/execute", json={})).json()["data"]["status"] == "Completed"
            await db.refresh(sold_to)
            assert sold_to.email == "new@buyer.test"
            bad = await run(c, tenant, "customers", "correct", selection(sold_to.id), {"fields": {"email": "not-an-email", "is_active": False}})
            assert bad["summary"]["eligible"] == 0
            two = await run(c, tenant, "customers", "correct", selection(sold_to.id, spare.id), {"fields": {"phone": "1"}})
            assert two["summary"]["eligible"] == 0 and "one record at a time" in two["analysis"]["assessments"][0]["reasons"][0]
            prod = await run(c, tenant, "products", "correct", selection(unsold.id), {"fields": {"price": 999}})
            assert prod["summary"]["eligible"] == 0 and "price" in prod["analysis"]["assessments"][0]["reasons"][0]
            # a completed sale is corrected by voiding it through the sale workflow, which needs approval
            void = await run(c, tenant, "sales", "correct", selection(paid["id"]), {"action": "void"})
            assert void["summary"]["eligible"] == 1 and void["approval_required"] is True
            await c.post(f"{DM}/operations/{void['id']}/submit", json={"reason": "The sale was entered for the wrong shop"})
        async with as_admin(other) as c:
            await c.post(f"{DM}/operations/{void['id']}/decision", json={"approve": True})
        async with as_admin(both) as c:
            done = (await c.post(f"{DM}/operations/{void['id']}/execute", json={})).json()["data"]
            assert done["status"] == "Completed"
            from app.modules.sales.models.order import Order
            order = await db.get(Order, uuid.UUID(paid["id"]), populate_existing=True)
            assert order.status == "Cancelled"  # voided through the sale's own service: reversed, not deleted
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_closing_a_period_shows_balances_blocks_unfinished_work_and_locks_the_books_without_touching_entries(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    both = await platform_admin(db, "Both", list(ALL))
    other = await platform_admin(db, "Other", ["data:approve"])
    today = datetime.now(UTC).date().isoformat()
    try:
        async with as_admin(both) as c:
            future = await run(c, tenant, "accounting", "reset", None, {"closing_date": (datetime.now(UTC).date() + timedelta(days=3)).isoformat()})
            assert any("future" in b["what"] for b in future["analysis"]["blockers"]) and future["summary"]["eligible"] == 0
            from app.modules.sales.models.order import Order
            held = await db.get(Order, uuid.UUID(draft["id"]))
            held.status = "Awaiting Approval"
            await db.flush()
            unfinished = await run(c, tenant, "accounting", "reset", None, {"closing_date": today})
            assert any("waiting for approval" in b["what"] for b in unfinished["analysis"]["blockers"])
            assert unfinished["analysis"]["preview"]["balances"]["asset"] and unfinished["analysis"]["preview"]["books_balanced"] is True
            assert (await c.post(f"{DM}/operations/{unfinished['id']}/submit", json={"reason": "Closing the first month of trading"})).status_code == 422
            held.status = "Pending"
            await db.flush()
            ready = await run(c, tenant, "accounting", "reset", None, {"closing_date": today})
            assert ready["analysis"]["blockers"] == [] and ready["approval_required"] is True
            await c.post(f"{DM}/operations/{ready['id']}/submit", json={"reason": "Closing the first month of trading"})
        async with as_admin(other) as c:
            await c.post(f"{DM}/operations/{ready['id']}/decision", json={"approve": True})
        async with as_admin(both) as c:
            done = (await c.post(f"{DM}/operations/{ready['id']}/execute", json={"confirm": {"business_name": "Kigali Traders", "reference": ready["reference"]}})).json()["data"]
            assert done["status"] == "Completed" and done["result"]["locked_through"] == today and done["result"]["opening_position"]["balances"]["asset"]
            from app.modules.accounting.models.workspace import AccountingPreference
            assert (await db.get(AccountingPreference, tenant.id, populate_existing=True)).locked_through.isoformat() == today
            again = await run(c, tenant, "accounting", "reset", None, {"closing_date": today})
            assert any("already closed" in b["what"] for b in again["analysis"]["blockers"])
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_another_business_is_never_reachable_and_unsupported_operations_say_why(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    other_tenant, _, _, _, _, _, other_paid, _ = await world(db, monkeypatch)
    both = await platform_admin(db, "Both", list(ALL))
    try:
        async with as_admin(both) as c:
            # a record id from the other business, asked for through this business, is not found and not touched
            assert (await c.get(f"{DM}/businesses/{tenant.id}/modules/sales/records/{other_paid['id']}")).status_code == 404
            plan = await run(c, tenant, "sales", "archive", selection(draft["id"], other_paid["id"]))
            assert plan["summary"]["selected"] == 1 and plan["analysis"]["not_found"] == [other_paid["id"]]
            assert (await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": "sales", "operation": "archive", "selection": selection(other_paid["id"])})).status_code == 422
            no_delete = await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": "accounting", "operation": "delete", "selection": selection(uuid.uuid4())})
            assert no_delete.status_code == 422 and "Reverse them" in no_delete.json()["message"]
            for module in ("stock_movements", "debts", "hr"):
                r = await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": module, "operation": "delete", "selection": selection(uuid.uuid4())})
                assert r.status_code == 422, module
            assert (await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": "sales", "operation": "delete", "selection": {"mode": "matching", "filters": {}}})).status_code == 422  # all dates, unconfirmed
            recovery = (await c.get(f"{DM}/businesses/{tenant.id}/recovery")).json()["data"]
            assert recovery["backups"] == [] and recovery["backup_system"]["configured"] is False
            assert other_tenant.id != tenant.id
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_history_is_complete_filterable_and_cannot_be_rewritten(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    both = await platform_admin(db, "Both", list(ALL))
    try:
        async with as_admin(both) as c:
            plan = await run(c, tenant, "customers", "archive", selection(spare.id))
            await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "Spare customer is not needed any more"})
            await c.post(f"{DM}/operations/{plan['id']}/execute", json={})
            await run(c, tenant, "customers", "archive", selection(sold_to.id))  # prepared, never submitted
            listed = (await c.get(f"{DM}/operations", params={"tenant_id": str(tenant.id)})).json()["data"]
            assert [o["reference"] for o in listed["items"]] == [plan["reference"]]
            assert len((await c.get(f"{DM}/operations", params={"tenant_id": str(tenant.id), "include_drafts": "true"})).json()["data"]["items"]) == 2
            assert (await c.get(f"{DM}/operations", params={"module": "sales", "tenant_id": str(tenant.id)})).json()["data"]["items"] == []
            assert (await c.get(f"{DM}/operations", params={"operation": "archive", "status": "Completed", "tenant_id": str(tenant.id)})).json()["data"]["total"] == 1
            detail = (await c.get(f"{DM}/operations/{plan['id']}")).json()["data"]
            assert detail["filters"] == {} and detail["selection"]["mode"] == "ids" and detail["decided_by"] is None and detail["executed_by"] == "Both"
            # the business's own audit trail shows the platform administrator's action
            trail = (await db.execute(text("SELECT action FROM audit_logs WHERE tenant_id = :t AND action LIKE 'data%' ORDER BY created_at"), {"t": tenant.id})).scalars().all()
            assert "data_operation.submitted" in trail and "data.archive" in trail and "data_operation.completed" in trail
        with pytest.raises(Exception, match="cannot be deleted"):
            async with db.begin_nested():
                await db.execute(text("DELETE FROM data_operations WHERE id = :i"), {"i": plan["id"]})
        with pytest.raises(Exception, match="cannot be edited or deleted"):
            async with db.begin_nested():
                await db.execute(text("UPDATE data_operation_items SET outcome = 'failed' WHERE operation_id = :i"), {"i": plan["id"]})
        # saved filters authorise nothing: they only fill in the filter bar
        async with as_admin(both) as c:
            saved = await c.post(f"{DM}/saved-filters", json={"module": "sales", "name": "Unpaid last 30 days", "tenant_id": str(tenant.id), "filters": {"payment_status": "Unpaid", "preset": "last_30_days"}})
            assert saved.status_code == 201
            assert [f["name"] for f in (await c.get(f"{DM}/saved-filters", params={"module": "sales"})).json()["data"]] == ["Unpaid last 30 days"]
    finally:
        app.dependency_overrides.clear()




@pytest.mark.db
async def test_module_rules_for_users_warehouses_products_and_expenses(db, monkeypatch):
    from datetime import date

    from app.modules.accounting.models.expense import Expense
    from app.modules.inventory.service.stock_ledger import ensure_default_warehouse
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    both = await platform_admin(db, "Both", list(ALL))
    stocked = Product(tenant_id=tenant.id, name="Has stock", sku="HAS1", price=5, cost=2, stock=4)
    pending = Expense(tenant_id=tenant.id, reference="EXP-T1", title="Taxi", amount=10, expense_date=date.today(), category="Travel", status="Pending")
    approved = Expense(tenant_id=tenant.id, reference="EXP-T2", title="Rent", amount=50, expense_date=date.today(), category="Rent", status="Approved")
    db.add_all([stocked, pending, approved])
    await db.flush()
    main = await ensure_default_warehouse(db, tenant.id)
    try:
        async with as_admin(both) as c:
            prod = await run(c, tenant, "products", "delete", selection(stocked.id, unsold.id))
            reasons = {a["id"]: a["reasons"] for a in prod["analysis"]["assessments"] if not a["eligible"]}
            assert prod["summary"]["eligible"] == 1 and any("4 units are in stock" in r for r in reasons[str(stocked.id)])
            exp = await run(c, tenant, "expenses", "delete", selection(pending.id, approved.id))
            assert exp["summary"]["eligible"] == 1 and any("posted to the books" in r for a in exp["analysis"]["assessments"] if not a["eligible"] for r in a["reasons"])
            wh = await run(c, tenant, "warehouses", "archive", selection(main.id))
            assert wh["summary"]["eligible"] == 0 and any("default warehouse" in r for r in wh["analysis"]["assessments"][0]["reasons"])
            last_owner = await run(c, tenant, "users", "archive", selection(owner.id))
            assert last_owner["summary"]["eligible"] in (0, 1)  # the fixture owner has role "owner": the last active owner is protected
            owners = (await db.execute(select(User).where(User.tenant_id == tenant.id, User.role == "owner"))).scalars().all()
            if len(owners) == 1:
                assert last_owner["summary"]["eligible"] == 0 and "last active owner" in last_owner["analysis"]["assessments"][0]["reasons"][0]
            assert (await c.post(f"{DM}/businesses/{tenant.id}/operations", json={"module": "users", "operation": "delete", "selection": selection(owner.id)})).status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_one_failing_record_does_not_stop_the_others_and_the_result_says_which(db, monkeypatch):
    from app.modules.admin.data_management import plans
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    extra = Customer(tenant_id=tenant.id, name="Third")
    db.add(extra)
    await db.flush()
    both = await platform_admin(db, "Both", list(ALL))
    real = plans.run_one

    async def flaky(db_, tenant_, admin_, module, op, rid, payload, reason, ref):
        if rid == spare.id:
            raise RuntimeError("the database said no")
        return await real(db_, tenant_, admin_, module, op, rid, payload, reason, ref)

    monkeypatch.setattr(plans, "run_one", flaky)
    try:
        async with as_admin(both) as c:
            plan = await run(c, tenant, "customers", "archive", selection(sold_to.id, spare.id, extra.id))
            await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": "Archiving three customers in one go"})
            done = (await c.post(f"{DM}/operations/{plan['id']}/execute", json={})).json()["data"]
            assert done["status"] == "PartiallyCompleted" and done["result"]["counts"] == {"affected": 2, "blocked": 0, "failed": 1, "skipped": 0}
            failed = (await c.get(f"{DM}/operations/{plan['id']}/items", params={"outcome": "failed"})).json()["data"]["items"]
            assert [i["label"] for i in failed] == ["Spare Customer"] and "database said no" in failed[0]["message"]
            await db.refresh(extra)
            await db.refresh(spare)
            assert extra.is_active is False and spare.is_active is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_filter_options_are_this_businesss_own_values(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    other_tenant, *_ = await world(db, monkeypatch)
    viewer = await platform_admin(db, "Viewer", ["data:view"])
    try:
        async with as_admin(viewer) as c:
            options = (await c.get(f"{DM}/businesses/{tenant.id}/modules/sales/filter-options")).json()["data"]
            assert {o["id"] for o in options["status"]} == {"Completed", "Pending"}
            assert str(owner.id) in {o["id"] for o in options["salesperson_id"]} and str(sold_to.id) in {o["id"] for o in options["customer_id"]}
            other_users = {str(u) for u in (await db.execute(select(User.id).where(User.tenant_id == other_tenant.id))).scalars()}
            assert not other_users & {o["id"] for o in options["created_by"]}
    finally:
        app.dependency_overrides.clear()


async def _pending(c, tenant, customer, reason="This customer was created by mistake"):
    plan = await run(c, tenant, "customers", "delete", selection(customer.id))
    submitted = await c.post(f"{DM}/operations/{plan['id']}/submit", json={"reason": reason})
    assert submitted.status_code == 200 and submitted.json()["data"]["status"] == "PendingApproval"
    return plan


def _confirm(tenant_name, plan):
    return {"business_name": tenant_name, "reference": plan["reference"]}


@pytest.mark.db
async def test_the_requester_may_approve_their_own_operation_unless_a_second_approver_is_required(db, monkeypatch):
    tenant, owner, sold_to, spare, *_ = await world(db, monkeypatch)
    third = Customer(tenant_id=tenant.id, name="Third Spare")
    db.add(third)
    await db.flush()
    solo = await platform_admin(db, "Solo", list(ALL))
    viewer = await platform_admin(db, "Viewer", ["data:view"])
    try:
        async with as_admin(viewer) as c:
            assert (await c.put(f"{DM}/settings", json={"require_second_approver": True})).status_code == 403  # changing it needs the approval permission
        async with as_admin(solo) as c:
            assert (await c.get(f"{DM}/settings")).json()["data"]["require_second_approver"] is False  # off until someone switches it on
            assert (await c.get(f"{DM}/me")).json()["data"]["require_second_approver"] is False
            plan = await _pending(c, tenant, spare)
            approved = await c.post(f"{DM}/operations/{plan['id']}/decision", json={"approve": True})
            assert approved.status_code == 200
            data = approved.json()["data"]
            assert data["status"] == "Approved" and data["self_approved"] is True and data["decided_by"] == "Solo" and data["requested_by"] == "Solo"
            assert (await c.post(f"{DM}/operations/{plan['id']}/decision", json={"approve": False, "note": "no"})).status_code == 409  # already decided

            # switched on: the same request can no longer be approved by its requester
            assert (await c.put(f"{DM}/settings", json={"require_second_approver": True})).status_code == 200
            assert (await c.get(f"{DM}/settings")).json()["data"]["require_second_approver"] is True
            blocked = await _pending(c, tenant, third)
            assert (await c.post(f"{DM}/operations/{blocked['id']}/decision", json={"approve": True})).status_code == 403
            refused = await c.post(f"{DM}/operations/{blocked['id']}/approve-and-run", json={"confirm": _confirm("Kigali Traders", blocked)})
            assert refused.status_code == 403
            row = await db.get(DataOperation, uuid.UUID(blocked["id"]), populate_existing=True)
            assert row.status == "PendingApproval" and row.self_approved is False
        audit = (await db.execute(text("select changes from audit_logs where action = 'data_management.second_approver_setting' and actor_user_id = :u order by created_at"), {"u": solo.id})).scalars().all()
        assert [a["after"] for a in audit] == [True]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_approve_and_run_needs_the_reason_and_the_typed_confirmation_then_records_a_self_approval(db, monkeypatch):
    tenant, owner, sold_to, spare, *_ = await world(db, monkeypatch)
    solo = await platform_admin(db, "Solo", list(ALL))
    try:
        async with as_admin(solo) as c:
            plan = await run(c, tenant, "customers", "delete", selection(spare.id))
            url = f"{DM}/operations/{plan['id']}/approve-and-run"
            assert (await c.post(url, json={"reason": "Too short", "confirm": _confirm("Kigali Traders", plan)})).status_code == 422  # reason is at least 10 characters
            assert (await c.post(url, json={"reason": "This customer was created by mistake", "confirm": {"business_name": "Kigali", "reference": plan["reference"]}})).status_code == 422
            assert (await c.post(url, json={"reason": "This customer was created by mistake"})).status_code == 422  # nothing typed
            assert (await db.get(DataOperation, uuid.UUID(plan["id"]), populate_existing=True)).status == "Prepared"
            assert await db.get(Customer, spare.id) is not None
            done = await c.post(url, json={"reason": "This customer was created by mistake", "confirm": _confirm("Kigali Traders", plan)})
            assert done.status_code == 200, done.text
            data = done.json()["data"]
            assert data["status"] == "Completed" and data["affected"] == 1
            assert data["self_approved"] is True and data["decided_by"] == "Solo" and data["executed_by"] == "Solo" and data["reason"] == "This customer was created by mistake"
            assert await db.get(Customer, spare.id) is None
            listed = (await c.get(f"{DM}/operations", params={"tenant_id": str(tenant.id)})).json()["data"]["items"]
            assert next(o for o in listed if o["id"] == plan["id"])["self_approved"] is True
        trail = (await db.execute(text("select changes from audit_logs where entity_id = :i and action = 'data_operation.approved'"), {"i": plan["id"]})).scalars().all()
        assert trail and trail[0]["self_approved"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_approve_and_run_checks_eligibility_again_so_a_record_that_became_used_is_not_removed(db, monkeypatch):
    tenant, owner, sold_to, spare, product, unsold, paid, draft = await world(db, monkeypatch)
    solo = await platform_admin(db, "Solo", list(ALL))
    try:
        async with as_admin(solo) as c:
            plan = await run(c, tenant, "customers", "delete", selection(spare.id))
            assert plan["summary"]["eligible"] == 1
            await db.execute(text("update sales_orders set customer_id = :c where id = :o"), {"c": spare.id, "o": draft["id"]})  # a sale now uses this customer
            await db.flush()
            done = await c.post(f"{DM}/operations/{plan['id']}/approve-and-run", json={"reason": "This customer was created by mistake", "confirm": _confirm("Kigali Traders", plan)})
            assert done.status_code == 200, done.text
            data = done.json()["data"]
            assert data["status"] == "Failed" and data["result"]["counts"]["blocked"] == 1 and data["affected"] == 0
            assert await db.get(Customer, spare.id) is not None
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_bulk_approve_and_run_needs_one_typed_confirmation_and_respects_the_second_approver_setting(db, monkeypatch):
    tenant, owner, sold_to, spare, *_ = await world(db, monkeypatch)
    extra = Customer(tenant_id=tenant.id, name="Second Spare")
    db.add(extra)
    await db.flush()
    solo = await platform_admin(db, "Solo", list(ALL))
    spare_id, extra_id = spare.id, extra.id  # a failed step rolls the session back and expires loaded objects
    try:
        async with as_admin(solo) as c:
            one, two = await _pending(c, tenant, spare), await _pending(c, tenant, extra, "Created by mistake as well")
            url = f"{DM}/operations/approve-and-run-batch"
            ids = [one["id"], two["id"]]
            assert (await c.post(url, json={"ids": ids, "phrase": "RUN 3"})).status_code == 422
            assert (await c.post(url, json={"ids": ids, "phrase": ""})).status_code == 422
            assert await db.get(Customer, spare_id) is not None

            await c.put(f"{DM}/settings", json={"require_second_approver": True})
            held = (await c.post(url, json={"ids": ids, "phrase": "run 2"})).json()["data"]["results"]
            assert [r["status"] for r in held] == ["NotRun", "NotRun"] and all("another administrator" in r["error"] for r in held)
            assert await db.get(Customer, spare_id) is not None and await db.get(Customer, extra_id) is not None

            await c.put(f"{DM}/settings", json={"require_second_approver": False})
            done = (await c.post(url, json={"ids": ids, "phrase": "run 2"})).json()["data"]["results"]
            assert [r["status"] for r in done] == ["Completed", "Completed"] and [r["affected"] for r in done] == [1, 1]
            assert await db.get(Customer, spare_id) is None and await db.get(Customer, extra_id) is None
            again = await c.post(url, json={"ids": ids, "phrase": "RUN 2"})
            assert again.status_code == 409  # only operations still waiting for approval can be chosen
            for oid in ids:
                assert (await db.get(DataOperation, uuid.UUID(oid), populate_existing=True)).self_approved is True
    finally:
        app.dependency_overrides.clear()
