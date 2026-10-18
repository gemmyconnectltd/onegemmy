"""Admin workflows use real repositories in an always rolled-back transaction."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select

from app.core.deps import get_current_active_superuser
from app.core.exceptions import ForbiddenError
from app.modules.admin import analytics
from app.modules.admin.export import COLUMN_DEFS
from app.modules.admin.routes import AdminTenantCreate, InviteUserPayload, _tenant_usage_map
from app.modules.auth.schemas import RegisterRequest
from app.modules.tenants.models import Tenant, TenantSlugAlias, User
from app.modules.tenants.repository import TenantRepository
from app.modules.tenants.schemas import TenantCreate, TenantUpdate, UserCreate
from app.modules.tenants.service import tenant as tenant_service


def test_text_is_trimmed_before_validation_and_credentials_are_preserved():
    model = AdminTenantCreate(name="  Shop  ", owner_full_name="  Owner  ",
                             owner_email="  owner@example.com  ", city=" Kigali ")
    assert (model.name, model.owner_full_name, model.owner_email, model.city) == (
        "Shop", "Owner", "owner@example.com", "Kigali")
    req = RegisterRequest(tenant_name=" Shop ", tenant_slug=" shop ", full_name=" Owner ",
                          email=" owner@example.com ", password="  Passw0rd!  ")
    assert req.password == "  Passw0rd!  "
    assert UserCreate(email=" x@example.com ", full_name=" Name ").full_name == "Name"
    with pytest.raises(PydanticValidationError):
        TenantCreate(name="   ")
    with pytest.raises(PydanticValidationError):
        InviteUserPayload(email="x@example.com", full_name="X", role="superadmin")


async def test_owner_cannot_access_platform_even_with_superuser_flag():
    owner = SimpleNamespace(id=uuid.uuid4(), tenant_id=uuid.uuid4(), is_superuser=True, role="owner")
    with pytest.raises(ForbiddenError):
        await get_current_active_superuser(owner)
    owner.tenant_id = None  # Even a legacy orphan cannot become platform staff.
    with pytest.raises(ForbiddenError):
        await get_current_active_superuser(owner)
    owner.role = "superadmin"
    assert await get_current_active_superuser(owner) is owner
    assert COLUMN_DEFS["role"][1]({"is_superuser": True, "role": "owner", "tenant_id": "tenant"}) == "Owner"


@pytest.mark.db
async def test_slug_collisions_and_historical_aliases(db):
    unique = uuid.uuid4().hex[:12]
    first = await tenant_service.create_tenant(db, TenantCreate(name=f"  Shop {unique}  ", slug=f"MY SHOP {unique}"))
    second = await tenant_service.create_tenant(db, TenantCreate(name="Other", slug=f"my-shop-{unique}"))
    assert first.slug == f"my-shop-{unique}" and second.slug == f"my-shop-{unique}-2"
    updated = await tenant_service.update_tenant(db, first.id, TenantUpdate(slug=f"New Shop {unique}", city=" Kigali "))
    assert updated.slug == f"new-shop-{unique}" and updated.city == "Kigali"
    assert (await TenantRepository(db).get_by_slug(first.slug)).id == first.id
    third = await tenant_service.create_tenant(db, TenantCreate(name="Third", slug=first.slug))
    assert third.slug == f"my-shop-{unique}-3"  # Old aliases stay reserved.
    assert await db.get(TenantSlugAlias, first.slug) is not None


@pytest.mark.db
async def test_admin_create_edit_archive_owner_and_role_filters(db, monkeypatch):
    from httpx import ASGITransport, AsyncClient

    import app.modules.admin.service as admin_service
    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app
    from app.modules.audit.models import AuditLog

    sent = []

    async def invite(**kw):
        sent.append(kw)
        return True

    monkeypatch.setattr(admin_service, "send_invite_email", invite)
    admin = User(email=f"staff-{uuid.uuid4().hex}@example.com", hashed_password="x", full_name="Staff",
                 role="superadmin", tenant_id=None, is_active=True, is_superuser=True)
    db.add(admin)
    await db.flush()

    async def _db():
        yield db

    async def _user():
        return admin

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = _user
    key = uuid.uuid4().hex[:10]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            missing = await client.post("/api/v1/admin/tenants", json={"name": "No owner"})
            assert missing.status_code == 422
            created = await client.post("/api/v1/admin/tenants", json={
                "name": f"  Business {key}  ", "slug": f" QA {key} ", "owner_full_name": "  Owner Name ",
                "owner_email": f" {key}@example.com ", "city": " Kigali ", "country": " Rwanda ",
            })
            assert created.status_code == 201, created.text
            data = created.json()["data"]
            tenant_id = data["id"]
            assert data["name"] == f"Business {key}" and data["slug"] == f"qa-{key}"
            owner = (await db.execute(select(User).where(User.tenant_id == uuid.UUID(tenant_id)))).scalar_one()
            assert owner.role == "owner" and owner.role_id is not None and owner.is_superuser
            assert len(sent) == 1 and sent[0]["to"] == f"{key}@example.com"
            collision = await client.post("/api/v1/admin/tenants", json={
                "name": "Should not exist", "owner_full_name": "Owner", "owner_email": f"{key}@example.com",
            })
            assert collision.status_code == 409
            edited = await client.patch(f"/api/v1/admin/tenants/{tenant_id}", json={
                "name": "  Renamed Business  ", "slug": f"New {key}", "city": "  Kigali ", "preferred_contact": "phone",
            })
            assert edited.status_code == 200 and edited.json()["data"]["name"] == "Renamed Business"
            users = await client.get(f"/api/v1/admin/users?tenant_id={tenant_id}&role=owner")
            assert users.json()["data"]["total"] == 1
            listing = await client.get(f"/api/v1/admin/tenants?q=new-{key}&sort=name&dir=asc&page_size=1")
            assert listing.json()["data"]["total"] == 1
            archived = await client.delete(f"/api/v1/admin/tenants/{tenant_id}")
            assert archived.status_code == 200, archived.text
            tenant = await db.get(Tenant, uuid.UUID(tenant_id))
            assert tenant.archived_at is not None and tenant.is_active is False
            assert (await db.get(User, owner.id)) is not None
            activation = await client.post(f"/api/v1/admin/tenants/{tenant_id}/activate")
            assert activation.status_code == 422
            bypass = await client.patch(f"/api/v1/admin/tenants/{tenant_id}", json={"is_active": True})
            assert bypass.status_code == 422
            assert (await db.execute(select(AuditLog.id).where(AuditLog.entity_id == tenant_id, AuditLog.action == "tenant.delete"))).first()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_sales_are_separate_and_overview_usage_sources_match(db, monkeypatch):
    from app.modules.sales.models.order import Order

    tenants = []
    for currency, amount in [("USD", Decimal("100.25")), ("RWF", Decimal(650))]:
        tenant = Tenant(name="Money Test", slug=uuid.uuid4().hex, currency=currency, subscription_plan="currency-test")
        db.add(tenant)
        await db.flush()
        db.add(Order(tenant_id=tenant.id, order_number=uuid.uuid4().hex, status="Completed", total=amount,
                     base_total=amount, ordered_at=datetime.now(UTC)))
        db.add(Order(tenant_id=tenant.id, order_number=uuid.uuid4().hex, status="Draft", total=999999,
                     base_total=999999, ordered_at=datetime.now(UTC)))
        tenants.append(tenant)
    await db.flush()

    async def run(fn):
        return await fn(db)

    monkeypatch.setattr(analytics, "_run", run)
    analytics.invalidate_analytics_cache()
    totals = await analytics.all_time_sales_converted()
    plans = await analytics.all_time_sales_by_plan()
    assert plans["original_by_plan"]["currency-test"] == {"USD": 100.25, "RWF": 650.0}
    assert totals["by_currency"]["USD"] >= 100.25 and totals["by_currency"]["RWF"] >= 650
    usage = await _tenant_usage_map(db, [t.id for t in tenants])
    assert usage[tenants[0].id]["revenue"] == 100.25 and usage[tenants[1].id]["revenue"] == 650.0
    analytics.invalidate_analytics_cache()


@pytest.mark.db
async def test_identity_migration_is_repeatable_and_legacy_slug_resolves(db):
    import importlib.util
    from pathlib import Path

    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    legacy = Tenant(name="  Legacy Business  ", slug=f"TEN-LEGACY-{uuid.uuid4().hex[:10].upper()}")
    db.add(legacy)
    await db.flush()
    old_slug = legacy.slug
    path = Path(__file__).parents[1] / "alembic/versions/a92d6017bc34_normalize_tenant_identity.py"
    spec = importlib.util.spec_from_file_location("identity_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def upgrade(connection):
        with Operations.context(MigrationContext.configure(connection)):
            module.upgrade()
            module.upgrade()

    await db.run_sync(lambda session: upgrade(session.connection()))
    await db.refresh(legacy)
    assert legacy.name == "Legacy Business" and legacy.slug == old_slug[4:].lower()
    assert (await TenantRepository(db).get_by_slug(old_slug)).id == legacy.id


@pytest.mark.db
async def test_signup_still_rejects_weak_passwords(db):
    from app.core.exceptions import ValidationError
    from app.modules.auth.service import register

    with pytest.raises(ValidationError):
        await register(db, RegisterRequest(tenant_name="Shop", tenant_slug="shop", full_name="Owner",
                                           email="owner@example.com", password="weak"))


@pytest.mark.db
async def test_server_pagination_filters_and_custom_plan_labels(db):
    from app.modules.admin.repository import tenant_plan_labels
    from app.modules.billing.models import BillingPlan

    key = uuid.uuid4().hex[:10]
    plan = BillingPlan(name="Custom QA Plan", status="active")
    db.add(plan)
    await db.flush()
    for index in range(30):
        db.add(Tenant(name=f"  {key} {index:02d}  ", slug=f"{key}-{index}",
                      subscription_plan=str(plan.id), subscription_status="trialing" if index < 20 else "canceled"))
    await db.flush()
    repo = TenantRepository(db)
    rows, count = await repo.admin_page(0, 1, {"q": key, "status": "trial", "sort": "name", "dir": "asc"})
    assert count == 20 and len(rows) == 1 and rows[0].name.strip() == f"{key} 00"
    rows, count = await repo.admin_page(0, 1, {"q": key, "status": "cancelled"})
    assert count == 10 and len(rows) == 1
    assert (await tenant_plan_labels(db))[str(plan.id)] == "Custom QA Plan"
