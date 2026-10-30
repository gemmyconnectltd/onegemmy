"""Black-box route audit: every ERP module endpoint is refused for a business whose plan lacks the module, and a module the
business turned off stays readable but takes no writes. Calls the real routes through the app, so a new route that forgets its
feature gate (or one shadowed by a generic route) fails here."""
import re
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.modules.billing.repository import BillingRepository
from app.modules.tenants.models import Tenant, User

MODULE_SEGMENTS = {"accounting", "crm", "debts", "expense-management", "hr", "inventory", "manufacturing", "procurement", "repairs", "sales", "services"}
METHODS = {"get", "post", "patch", "put", "delete"}


@pytest.fixture(autouse=True)
def plan_entitlements_on(monkeypatch):
    """These tests are about plans deciding module access, which is switched off by default (ENFORCE_PLAN_ENTITLEMENTS)."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "ENFORCE_PLAN_ENTITLEMENTS", True)


async def probe(db, monkeypatch, modules, activation=None, restricted=False):
    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app

    tenant = Tenant(name="Audit", slug=uuid.uuid4().hex, module_activation=activation or {})
    db.add(tenant)
    await db.flush()
    if restricted:  # an employee whose role grants nothing at all
        from app.modules.tenants.models import Role
        from app.modules.tenants.service import ensure_permissions_seeded
        await ensure_permissions_seeded(db)
        role = Role(tenant_id=tenant.id, name="Nothing")
        db.add(role)
        await db.flush()
        owner = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@x.test", full_name="Nobody", role="member", role_id=role.id, hashed_password="x", is_active=True)
    else:
        owner = User(tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@x.test", full_name="Owner", role="owner", is_superuser=True, hashed_password="x")
    db.add(owner)
    await db.flush()
    monkeypatch.setattr(BillingRepository, "subscription", AsyncMock(return_value=SimpleNamespace(terms={"modules": modules}, plan_id=uuid.uuid4(), status="active")))

    async def _db():
        yield db

    async def _user():
        return owner

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = _user
    results: list[tuple[str, str, str, int, str]] = []
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            spec = (await client.get("/openapi.json")).json()
            for path, ops in spec["paths"].items():
                parts = path.split("/")
                audited = path.startswith("/api/v1/tenants/") and parts[4] in MODULE_SEGMENTS or path.startswith("/api/v1/tenants/reports/daily-branches")
                if not audited:
                    continue
                url = re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)
                for method in ops:
                    if method in METHODS:
                        try:
                            r = await client.request(method.upper(), url, json={} if method != "get" else None)
                            results.append((parts[4], method.upper(), path, r.status_code, r.text))
                        except Exception as error:  # noqa: BLE001 - a made-up id reaching a handler is not what this audit is about
                            results.append((parts[4], method.upper(), path, 599, type(error).__name__))
    finally:
        app.dependency_overrides.clear()
    return results


@pytest.mark.db
async def test_every_module_route_is_refused_when_the_plan_lacks_the_module(db, monkeypatch):
    results = await probe(db, monkeypatch, modules=[])
    assert len(results) > 200  # the audit really covered the ERP surface
    leaks = [(m, p, code) for _, m, p, code, _ in results if code != 403]
    assert not leaks, f"routes reachable without a plan entitlement: {leaks[:10]}"


@pytest.mark.db
async def test_a_turned_off_module_takes_no_writes_but_stays_readable(db, monkeypatch):
    results = await probe(db, monkeypatch, modules=["inventory", "sales", "accounting", "hr"], activation={"hr": False})
    hr = [r for r in results if r[0] == "hr"]
    assert hr
    writes_allowed = [(m, p, code) for _, m, p, code, _ in hr if m != "GET" and code != 403]
    assert not writes_allowed, f"writes to a turned-off module: {writes_allowed[:10]}"
    # Reading is not refused for being turned off (it may still 404/422 on made-up ids).
    assert not [p for _, m, p, code, body in hr if m == "GET" and code == 403 and "turned off" in body]
    # The modules still on are unaffected by it.
    inventory = [r for r in results if r[0] == "inventory" and r[1] == "GET"]
    assert inventory and not [r for r in inventory if r[3] == 403 and "not part of your plan" in r[4]]


@pytest.mark.db
async def test_a_person_whose_role_grants_nothing_can_read_nothing_in_any_module(db, monkeypatch):
    """Hiding a feature from someone must hold on the server too, not only in the menu."""
    results = await probe(db, monkeypatch, modules=["inventory", "sales", "accounting", "hr", "procurement", "crm", "manufacturing", "services", "repairs"], restricted=True)
    reads = [(p, code) for _, m, p, code, _ in results if m == "GET"]
    assert len(reads) > 100
    leaks = [(p, code) for p, code in reads if code == 200]
    assert not leaks, f"readable with no permissions: {leaks[:10]}"
