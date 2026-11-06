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
