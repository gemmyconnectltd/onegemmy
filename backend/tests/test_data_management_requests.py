"""Business-owner deletion requests require platform review and a fresh eligibility check."""
import uuid
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import create_access_token
from app.main import app
from app.modules.tenants.models import User
from tests.test_sales_team import API, team

DM = "/api/v1/admin/data-management"


def client_for(user, tenant_id=None):
    claims = {"tenant_id": str(tenant_id)} if tenant_id else {}
    token = create_access_token(str(user.id), claims)
    return AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://t",
        headers={"Authorization": f"Bearer {token}"},
    )


async def platform_admin(db):
    admin = User(
        email=f"platform-{uuid.uuid4().hex}@example.test",
        hashed_password="x",
        full_name="Platform Reviewer",
        role="superadmin",
        is_superuser=True,
        is_active=True,
        tenant_id=None,
        platform_permissions=["data:view", "data:preview", "data:approve"],
    )
    db.add(admin)
    await db.flush()
    return admin


@pytest.mark.db
async def test_owner_submits_date_bounded_request_for_platform_review(db, monkeypatch):
    tenant, _, _, owner, business_client, make_sale = await team(db, monkeypatch)
    admin = await platform_admin(db)
    request_path = f"{API}/data-management-requests"
    today = datetime.now(UTC).date().isoformat()
    async with business_client(owner) as c:
        sale = await c.post(f"{API}/sales/orders", json=make_sale(1))
        assert sale.status_code == 201, sale.text
    payload = {
        "module": "sales",
        "date_type": "transaction",
        "from_date": today,
        "to_date": today,
        "reason": "Remove disposable test transactions after review",
    }
    try:
        async with client_for(owner, tenant.id) as c:
            modules = await c.get(f"{request_path}/modules")
            assert modules.status_code == 200
            assert "sales" in {item["key"] for item in modules.json()["data"]}

            created = await c.post(request_path, json=payload)
            assert created.status_code == 201, created.text
            request = created.json()["data"]
            assert request["status"] == "Submitted"
            assert request["filters"] == {
                "date_type": "transaction",
                "preset": "custom",
                "from": today,
                "to": today,
            }

            own_requests = await c.get(request_path)
            assert own_requests.status_code == 200
            assert own_requests.json()["data"]["items"][0]["id"] == request["id"]
            assert (await c.get(f"{DM}/requests")).status_code == 403

        async with client_for(admin) as c:
            queued = await c.get(f"{DM}/requests")
            assert queued.status_code == 200, queued.text
            row = next(item for item in queued.json()["data"]["items"] if item["id"] == request["id"])
            assert row["tenant_id"] == str(tenant.id)
            assert row["reason"] == payload["reason"]

            reviewed = await c.post(f"{DM}/requests/{request['id']}/prepare")
            assert reviewed.status_code == 201, reviewed.text
            op = reviewed.json()["data"]["operation"]
            assert op["operation"] == "delete"
            assert op["filters"] == request["filters"]
            assert op["approval_required"] is True

        async with client_for(owner, tenant.id) as c:
            tracked = await c.get(request_path)
            assert tracked.status_code == 200
            assert tracked.json()["data"]["items"][0]["status"] == "Preview prepared"
            assert tracked.json()["data"]["items"][0]["operation_id"] == op["id"]

            second = await c.post(request_path, json={**payload, "reason": "Remove the old duplicate records"})
            assert second.status_code == 201, second.text
            declined_id = second.json()["data"]["id"]

        async with client_for(admin) as c:
            blank_note = await c.post(f"{DM}/requests/{declined_id}/reject", json={"note": "   "})
            assert blank_note.status_code == 422
            declined = await c.post(f"{DM}/requests/{declined_id}/reject", json={"note": "The requested records are still in active use."})
            assert declined.status_code == 200, declined.text
            assert declined.json()["data"]["status"] == "Declined"

        async with client_for(owner, tenant.id) as c:
            tracked = await c.get(request_path)
            declined = next(item for item in tracked.json()["data"]["items"] if item["id"] == declined_id)
            assert declined["status"] == "Declined"
            assert declined["review_note"] == "The requested records are still in active use."
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_business_members_cannot_submit_or_read_owner_data_requests(db, monkeypatch):
    tenant, member, _, owner, _, _ = await team(db, monkeypatch)
    request_path = f"{API}/data-management-requests"
    try:
        async with client_for(member, tenant.id) as c:
            assert (await c.get(request_path)).status_code == 403
            assert (await c.post(request_path, json={
                "module": "sales",
                "from_date": "2026-10-01",
                "to_date": "2026-10-31",
                "reason": "Request without the owner role",
            })).status_code == 403

        async with client_for(owner, tenant.id) as c:
            bad_range = await c.post(request_path, json={
                "module": "sales",
                "from_date": "2026-11-01",
                "to_date": "2026-10-01",
                "reason": "Request dates in the wrong order",
            })
            assert bad_range.status_code == 422
            no_range = await c.post(request_path, json={
                "module": "sales",
                "reason": "Try to request without a date range",
            })
            assert no_range.status_code == 422
            blank_reason = await c.post(request_path, json={
                "module": "sales",
                "from_date": "2026-10-01",
                "to_date": "2026-10-31",
                "reason": "          ",
            })
            assert blank_reason.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_owner_asks_for_one_date_range_across_several_modules_and_the_platform_prepares_them_together(db, monkeypatch):
    tenant, _, _, owner, business_client, make_sale = await team(db, monkeypatch)
    admin = await platform_admin(db)
    path = f"{API}/data-management-requests"
    today = datetime.now(UTC).date().isoformat()
    body = {"modules": ["products", "customers", "sales"], "from_date": today, "to_date": today, "reason": "Closing the trial period: clearing what we tested with"}
    try:
        async with business_client(owner) as c:
            assert (await c.post(f"{API}/sales/orders", json=make_sale(1))).status_code == 201
        async with client_for(owner, tenant.id) as c:
            # all or nothing: one module that cannot be removed safely rejects the whole batch and creates nothing
            bad = await c.post(path, json={**body, "modules": ["sales", "accounting"]})
            assert bad.status_code == 422 and "does not support safe record removal" in bad.json()["message"]
            assert (await c.get(path)).json()["data"]["total"] == 0
            assert (await c.post(path, json={**body, "module": "sales"})).status_code == 422  # one module or a list, not both
            assert (await c.post(path, json={k: v for k, v in body.items() if k != "modules"})).status_code == 422  # neither
            made = await c.post(path, json=body)
            assert made.status_code == 201, made.text
            batch = made.json()["data"]
            assert len(batch["requests"]) == 3 and len({r["batch_id"] for r in batch["requests"]}) == 1 and batch["requests"][0]["batch_id"] == batch["batch_id"]
            assert {r["module"] for r in batch["requests"]} == {"products", "customers", "sales"}
            single = await c.post(path, json={"module": "sales", "from_date": today, "to_date": today, "reason": "A single module request still works"})
            assert single.status_code == 201 and single.json()["data"]["batch_id"] is None
        async with client_for(admin) as c:
            queue = (await c.get(f"{DM}/requests")).json()["data"]["items"]
            assert sum(1 for r in queue if r["batch_id"] == batch["batch_id"]) == 3
            done = await c.post(f"{DM}/requests/batch/{batch['batch_id']}/prepare")
            assert done.status_code == 201, done.text
            results = done.json()["data"]["results"]
            assert [r["module"] for r in results] == ["sales", "customers", "products"]  # what others depend on is looked at last
            by_module = {r["module"]: r for r in results}
            assert by_module["sales"]["operation"]["summary"]["selected"] == 1  # the sale made today
            assert by_module["customers"].get("empty") is True  # nothing created for customers in that range: closed with a reason, not left stuck
            declined = [r for r in (await c.get(f"{DM}/requests")).json()["data"]["items"] if r["batch_id"] == batch["batch_id"]]
            assert declined == []
            assert (await c.post(f"{DM}/requests/batch/{batch['batch_id']}/prepare")).status_code == 409  # already reviewed
            left = (await c.get(f"{DM}/requests")).json()["data"]["items"]
            assert not [r for r in left if r["batch_id"] == batch["batch_id"]] and [r for r in left if r["batch_id"] is None]
        async with client_for(owner, tenant.id) as c:
            tracked = (await c.get(path)).json()["data"]["items"]
            statuses = {r["module"]: r["status"] for r in tracked if r["batch_id"] == batch["batch_id"]}
            assert statuses["sales"] == "Preview prepared" and statuses["customers"] == "Declined"
            assert next(r for r in tracked if r["module"] == "customers" and r["batch_id"] == batch["batch_id"])["review_note"].startswith("No records matched")
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_whole_batch_can_be_declined_once_with_a_reason_and_only_by_its_own_business(db, monkeypatch):
    tenant, _, _, owner, business_client, make_sale = await team(db, monkeypatch)
    other_tenant, _, _, other_owner, *_ = await team(db, monkeypatch)
    admin = await platform_admin(db)
    admin.platform_permissions = ["data:view", "data:preview", "data:approve"]
    path = f"{API}/data-management-requests"
    today = datetime.now(UTC).date().isoformat()
    body = {"modules": ["sales", "customers"], "from_date": today, "to_date": today, "reason": "Removing records we no longer need to keep"}
    try:
        async with client_for(owner, tenant.id) as c:
            batch = (await c.post(path, json=body)).json()["data"]
        async with client_for(other_owner, other_tenant.id) as c:
            assert (await c.get(path)).json()["data"]["total"] == 0  # another business never sees it
        async with client_for(admin) as c:
            assert (await c.post(f"{DM}/requests/batch/{batch['batch_id']}/reject", json={"note": " "})).status_code == 422
            declined = await c.post(f"{DM}/requests/batch/{batch['batch_id']}/reject", json={"note": "These are still in daily use."})
            assert declined.status_code == 200 and declined.json()["data"]["declined"] == 2
            assert (await c.post(f"{DM}/requests/batch/{batch['batch_id']}/reject", json={"note": "Again"})).status_code == 409
        async with client_for(owner, tenant.id) as c:
            rows = (await c.get(path)).json()["data"]["items"]
            assert {r["status"] for r in rows} == {"Declined"} and {r["review_note"] for r in rows} == {"These are still in daily use."}
    finally:
        app.dependency_overrides.clear()
