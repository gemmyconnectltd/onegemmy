import uuid

import pytest

from app.modules.traffic import classify


@pytest.mark.parametrize(
    ("path", "module"),
    [("/sales/orders", "sales"), ("/pos", "pos"), ("/products", "inventory"), ("/crm/leads", "customers"),
     ("/procurement/orders", "purchases"), ("/", "other"), ("/mystery/page", "other")],
)
def test_erp_module_from_path(path, module):
    assert classify.erp_module(path) == module


@pytest.mark.db
async def test_activity_beacon_reports_and_admin_only(db, monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.core import cache
    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app
    from app.modules.admin import analytics
    from app.modules.tenants.models import Tenant, User
    from app.modules.traffic import erp_service
    from app.modules.traffic.models import ErpActivity

    async def sequential(*aws):  # the test shares one connection, which cannot run queries concurrently
        return [await a for a in aws]

    monkeypatch.setattr(erp_service.asyncio, "gather", sequential)
    monkeypatch.setattr(analytics, "AsyncSessionLocal", async_sessionmaker(bind=db.bind, expire_on_commit=False))
    cache.invalidate_cache("admin-analytics")

    n = uuid.uuid4().hex[:8]
    tenant = Tenant(name=f"Erp {n}", slug=f"erp-{n}", is_active=True)
    db.add(tenant)
    await db.flush()
    staff = User(email=f"s{n}@x.test", hashed_password="x", full_name="Staff", role="member", tenant_id=tenant.id, is_active=True)
    admin = User(email=f"a{n}@x.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    db.add_all([staff, admin])
    await db.flush()
    current = {"user": staff}

    async def _db():
        yield db

    async def _user():
        return current["user"]

    app.dependency_overrides[get_db], app.dependency_overrides[get_current_user] = _db, _user
    sid = uuid.uuid4().hex
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t") as c:
            ua = {"user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"}
            for path in ("/sales/orders?token=secret", "/pos", "/inventory"):
                assert (await c.post("/api/v1/activity", json={"session_id": sid, "path": path}, headers=ua)).status_code == 204
            assert (await c.post("/api/v1/activity", json={"session_id": "bad", "path": "/sales"})).status_code == 204
            stored = (await db.execute(select(ErpActivity).where(ErpActivity.tenant_id == tenant.id))).scalars().all()
            assert sorted((a.module, a.surface, a.path) for a in stored) == [
                ("inventory", "erp", "/inventory"), ("pos", "pos", "/pos"), ("sales", "erp", "/sales/orders")]

            current["user"] = admin  # platform staff have no business: nothing is recorded
            await c.post("/api/v1/activity", json={"session_id": sid, "path": "/sales"})
            assert len((await db.execute(select(ErpActivity).where(ErpActivity.session_id == sid))).scalars().all()) == 3

            cache.invalidate_cache("admin-analytics")
            report = (await c.get("/api/v1/admin/analytics/erp-traffic")).json()["data"]
            assert report["trackingActive"] and report["kpis"]["pageViews"]["value"] >= 3
            assert {m["module"] for m in report["modules"]} >= {"sales", "pos", "inventory"}
            assert all("previous" in row for row in report["series"])
            live = (await c.get("/api/v1/admin/analytics/erp-traffic/realtime")).json()["data"]
            assert live["onlineUsers"] >= 1 and len(live["hourly"]) == 48
            assert {a.device for a in stored} == {"mobile"} and {a.os for a in stored} == {"iOS"} and {a.browser for a in stored} == {"Safari"}
            devices = (await c.get("/api/v1/admin/analytics/erp-traffic/devices")).json()["data"]
            assert any(t["name"] == "mobile" for t in devices["types"]) and any(o["name"] == "iOS" for o in devices["os"])
            assert any(t["name"] == "mobile" for t in report["devices"]["types"])
            mods = (await c.get("/api/v1/admin/analytics/erp-traffic/modules")).json()["data"]
            assert any(m["module"] == "pos" and m["views"] >= 1 for m in mods["modules"])
            biz = (await c.get("/api/v1/admin/analytics/erp-traffic/businesses")).json()["data"]
            assert any(b["id"] == str(tenant.id) and b["views"] == 3 and b["users"] == 1 for b in biz["businesses"])
            eng = (await c.get("/api/v1/admin/analytics/erp-traffic/engagement")).json()["data"]
            assert len(eng["heatmap"]) == 7 and len(eng["heatmap"][0]) == 24 and eng["heatmapTotal"] >= 3

            current["user"] = staff
            assert (await c.get("/api/v1/admin/analytics/erp-traffic")).status_code in (401, 403)
    finally:
        app.dependency_overrides.clear()


def test_cached_aggregates_have_unique_names():
    """ttl_cache keys on the function's qualified name, so two cached helpers with the same name would share results."""
    from app.modules.traffic import erp_service, service

    def cached(mod):
        return {n for n, f in vars(mod).items() if callable(f) and getattr(f, "__wrapped__", None) and f.__module__ == mod.__name__}

    assert not cached(erp_service) & cached(service)


@pytest.mark.parametrize(
    ("ua", "device", "os_", "browser"),
    [
        ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", "desktop", "Windows", "Chrome"),
        ("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0", "desktop", "Windows", "Edge"),
        ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", "desktop", "macOS", "Safari"),
        ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "mobile", "iOS", "Safari"),
        ("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36", "mobile", "Android", "Chrome"),
        ("Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", "tablet", "Android", "Chrome"),
        ("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "tablet", "iOS", "Safari"),
        ("Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0", "desktop", "Linux", "Firefox"),
        ("Mozilla/5.0 (Linux; Android 12; Pixel 6; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36", "mobile", "Android", "In-app browser"),
    ],
)
def test_user_agent_is_reduced_to_coarse_labels(ua, device, os_, browser):
    assert (classify.device_type(ua), classify.os_name(ua), classify.browser_name(ua)) == (device, os_, browser)
