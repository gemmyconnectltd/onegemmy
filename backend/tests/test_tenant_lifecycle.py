"""Tenant lifecycle: suspend/reactivate, notifications, recovery links, exports and two-person archive."""
import io
import uuid
import zipfile
from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError as SchemaError
from sqlalchemy import select

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.admin import lifecycle
from app.modules.admin.models import TenantExport
from app.modules.tenants.models import Tenant, User


@pytest.fixture
def mail(monkeypatch):
    sent = []

    async def fake(to, subject, title, body_html, preheader="", sender="admin"):
        sent.append((to, subject))
        return not getattr(fake, "fail", False)

    async def reset(to, full_name, reset_link, sender="accounts"):
        sent.append((to, "reset"))
        assert "token=" in reset_link
        return True

    monkeypatch.setattr(lifecycle, "send_notice_email", fake)
    monkeypatch.setattr(lifecycle, "send_password_reset_email", reset)
    fake.sent = sent
    return fake


async def people(db):
    tenant = Tenant(name="Acme Ltd", slug=uuid.uuid4().hex, currency="USD")
    db.add(tenant)
    await db.flush()
    def user(role, name, **kw):
        return User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@example.test", full_name=name, role=role, hashed_password="secret-hash", **kw)
    owner, staff = user("owner", "Olive Owner"), user("staff", "Sam Staff")
    admin = User(email=f"{uuid.uuid4().hex}@pesaa.test", full_name="Admin One", role="superadmin", is_superuser=True, hashed_password="x")
    admin2 = User(email=f"{uuid.uuid4().hex}@pesaa.test", full_name="Admin Two", role="superadmin", is_superuser=True, hashed_password="x")
    db.add_all([owner, staff, admin, admin2])
    await db.flush()
    return tenant, owner, staff, admin, admin2


@pytest.mark.db
async def test_suspend_needs_reason_and_name_and_is_recorded(db, mail):
    tenant, owner, _, admin, _ = await people(db)
    with pytest.raises(SchemaError):
        lifecycle.SuspendRequest(reason="no", confirm_name="Acme Ltd")
    with pytest.raises(ValidationError):
        await lifecycle.suspend_tenant(tenant.id, lifecycle.SuspendRequest(reason="Unpaid invoices", confirm_name="Wrong"), db, admin)
    await lifecycle.suspend_tenant(tenant.id, lifecycle.SuspendRequest(reason="Unpaid invoices", confirm_name="Acme Ltd"), db, admin)
    assert not tenant.is_active and tenant.suspension_reason == "Unpaid invoices" and tenant.suspended_by == admin.id and tenant.suspended_at
    assert (owner.email, "Your Pesaa account for Acme Ltd has been suspended") in mail.sent
    with pytest.raises(ConflictError):
        await lifecycle.suspend_tenant(tenant.id, lifecycle.SuspendRequest(reason="Unpaid invoices", confirm_name="Acme Ltd"), db, admin)
    await lifecycle.reactivate_tenant(tenant.id, db, admin)
    assert tenant.is_active and tenant.reactivated_by == admin.id and tenant.suspension_reason == "Unpaid invoices"


@pytest.mark.db
async def test_notifications_target_audience_track_delivery_and_block_duplicates(db, mail):
    tenant, owner, staff, admin, _ = await people(db)
    request = lifecycle.NotificationRequest(kind="maintenance", audience="owner", subject="Maintenance", message="Tonight at 22:00", action_url="https://pesaa.io/status")
    result = (await lifecycle.send_notification(tenant.id, request, db, admin)).body
    assert b'"recipients":1' in result and (owner.email, "Maintenance") in mail.sent and (staff.email, "Maintenance") not in mail.sent
    with pytest.raises(ConflictError):
        await lifecycle.send_notification(tenant.id, request, db, admin)
    with pytest.raises(SchemaError):
        lifecycle.NotificationRequest(kind="billing", audience="all", subject="Bill", message="Pay", action_url="javascript:alert(1)")
    with pytest.raises(ValidationError):
        await lifecycle.send_notification(tenant.id, lifecycle.NotificationRequest(kind="billing", audience="selected", user_ids=[uuid.uuid4()], subject="Bill", message="Pay"), db, admin)
    mail.fail = True
    failed = (await lifecycle.send_notification(tenant.id, lifecycle.NotificationRequest(kind="security", audience="all", subject="Notice", message="Change password"), db, admin)).body
    assert b'"status":"failed"' in failed and b'"failed":2' in failed


@pytest.mark.db
async def test_recovery_link_is_emailed_and_never_returned(db, mail):
    tenant, _, staff, admin, _ = await people(db)
    response = (await lifecycle.send_recovery_link(tenant.id, staff.id, db, admin)).body
    assert (staff.email, "reset") in mail.sent and b"token" not in response and b"password" not in response.lower().replace(b"recovery link emailed", b"")
    with pytest.raises(NotFoundError):
        await lifecycle.send_recovery_link(tenant.id, admin.id, db, admin)  # a user of another business
    staff.is_active = False
    await db.flush()
    with pytest.raises(ValidationError):
        await lifecycle.send_recovery_link(tenant.id, staff.id, db, admin)


@pytest.mark.db
async def test_export_excludes_secrets_scopes_to_tenant_and_links_expire(db, mail):
    tenant, _, _, admin, admin2 = await people(db)
    other, *_ = await people(db)
    with pytest.raises(ValidationError):
        await lifecycle.request_export(tenant.id, lifecycle.ExportRequest(categories=["users", "sales"], fmt="csv"), db, admin)
    body = (await lifecycle.request_export(tenant.id, lifecycle.ExportRequest(categories=["users", "customers"], fmt="zip"), db, admin)).body
    import json
    info = json.loads(body)["data"]
    token = info["download_url"].split("token=")[1]
    response = await lifecycle.download_export(tenant.id, uuid.UUID(info["id"]), token, db, admin)
    archive = zipfile.ZipFile(io.BytesIO(response.body))
    users = archive.read("users.csv").decode("utf-8-sig")
    assert "hashed_password" not in users and "secret-hash" not in users and users.count("@example.test") == 2
    assert str(other.id) not in users
    export = await db.get(TenantExport, uuid.UUID(info["id"]))
    assert export.download_count == 1 and export.last_downloaded_by == admin.id
    with pytest.raises(ForbiddenError):
        await lifecycle.download_export(tenant.id, uuid.UUID(info["id"]), token, db, admin2)  # someone else's link
    with pytest.raises(ForbiddenError):
        await lifecycle.download_export(other.id, uuid.UUID(info["id"]), token, db, admin)  # wrong business
    export.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.flush()
    with pytest.raises(ForbiddenError):
        await lifecycle.download_export(tenant.id, uuid.UUID(info["id"]), token, db, admin)


@pytest.mark.db
async def test_archive_needs_name_reason_and_a_second_administrator(db, mail):
    tenant, _, _, admin, admin2 = await people(db)
    with pytest.raises(ValidationError):
        await lifecycle.request_archive(tenant.id, lifecycle.DeletionRequest(reason="Customer asked to close", confirm_name="Nope", acknowledge=True), db, admin)
    with pytest.raises(ValidationError):
        await lifecycle.request_archive(tenant.id, lifecycle.DeletionRequest(reason="Customer asked to close", confirm_name="Acme Ltd", acknowledge=False), db, admin)
    import json
    created = json.loads((await lifecycle.request_archive(tenant.id, lifecycle.DeletionRequest(reason="Customer asked to close", confirm_name="Acme Ltd", acknowledge=True), db, admin)).body)["data"]
    request_id = uuid.UUID(created["id"])
    with pytest.raises(ConflictError):
        await lifecycle.request_archive(tenant.id, lifecycle.DeletionRequest(reason="Customer asked to close", confirm_name="Acme Ltd", acknowledge=True), db, admin)
    with pytest.raises(ForbiddenError):
        await lifecycle.approve_archive(tenant.id, request_id, lifecycle.DecisionRequest(), db, admin)  # requester cannot approve
    assert tenant.archived_at is None
    await lifecycle.approve_archive(tenant.id, request_id, lifecycle.DecisionRequest(note="Verified"), db, admin2)
    assert tenant.archived_at is not None and not tenant.is_active
    assert (await db.execute(select(Tenant.id).where(Tenant.id == tenant.id))).first()  # nothing deleted
    with pytest.raises(ConflictError):
        await lifecycle.approve_archive(tenant.id, request_id, lifecycle.DecisionRequest(), db, admin2)
