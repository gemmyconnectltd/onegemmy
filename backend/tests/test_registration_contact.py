"""Self-registration records how the business wants to be contacted, and tells the reviewing admin."""
import uuid

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select

from app.core import email as email_mod
from app.modules.auth import service as auth_service
from app.modules.auth.schemas import RegisterRequest
from app.modules.tenants.models import Tenant, User

pytestmark = pytest.mark.db


def _req(**kw):
    n = uuid.uuid4().hex[:8]
    base = {"tenant_name": f"Biz {n}", "tenant_slug": f"biz-{n}", "email": f"{n}@example.com", "full_name": "Owner One", "password": "Passw0rd!x", "phone": "+250 788 000 111"}
    return RegisterRequest(**{**base, **kw})


async def test_preferred_contact_is_stored_and_defaults_to_email(db):
    await auth_service.register(db, _req(preferred_contact="phone"))
    await auth_service.register(db, _req(preferred_contact="whatsapp"))
    await auth_service.register(db, _req())
    rows = (await db.execute(select(Tenant).where(Tenant.subscription_status == "pending").order_by(Tenant.created_at.desc()).limit(3))).scalars().all()
    assert sorted(t.preferred_contact for t in rows) == ["email", "phone", "whatsapp"]


def test_only_email_or_phone_is_accepted():
    with pytest.raises(PydanticValidationError):
        _req(preferred_contact="carrier pigeon")


def test_admin_email_tells_the_reviewer_how_to_reach_the_business():
    html = email_mod._pending_signup_body("Kwame Mart", "kwame", "https://x/review", "Kwame A", "k@x.com", "+233 20 000 0000", "phone")
    assert "Prefers to be contacted by" in html and "Phone call (+233 20 000 0000)" in html
    html2 = email_mod._pending_signup_body("Kwame Mart", "kwame", "https://x/review", "Kwame A", "k@x.com", "+233", "email")
    assert "Email (k@x.com)" in html2
    assert "WhatsApp (+233)" in email_mod._pending_signup_body("K", "k", "https://x", "K", "k@x.com", "+233", "whatsapp")
    assert "Prefers" not in email_mod._pending_signup_body("Old", "old", "https://x")      # callers that don't pass it are unchanged


async def test_existing_register_flow_still_pending_and_inactive(db):
    res = await auth_service.register(db, _req())
    assert res.pending_approval is True
    t = (await db.execute(select(Tenant).where(Tenant.slug == res.tenant_slug))).scalars().one()
    assert t.is_active is False and (await db.execute(select(User).where(User.tenant_id == t.id))).scalars().one().role == "owner"


async def test_admin_tenant_list_and_detail_return_the_preferred_contact(db):
    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app

    res = await auth_service.register(db, _req(preferred_contact="whatsapp"))
    tenant = (await db.execute(select(Tenant).where(Tenant.slug == res.tenant_slug))).scalars().one()
    admin = User(email=f"{uuid.uuid4().hex[:8]}@pesaa.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    db.add(admin)
    await db.flush()

    async def _db():
        yield db

    async def _user():
        return admin

    app.dependency_overrides[get_db], app.dependency_overrides[get_current_user] = _db, _user
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t") as c:
            detail = (await c.get(f"/api/v1/admin/tenants/{tenant.id}")).json()["data"]
            listing = (await c.get("/api/v1/admin/tenants?page=1&page_size=100")).json()["data"]["items"]
    finally:
        app.dependency_overrides.clear()
    assert detail["preferred_contact"] == "whatsapp"
    assert next(t for t in listing if t["id"] == str(tenant.id))["preferred_contact"] == "whatsapp"
