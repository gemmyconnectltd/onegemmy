from datetime import UTC, datetime, timedelta

import pytest

from app.modules.admin.analytics import resolve_period
from app.modules.traffic import classify, service
from app.modules.traffic.models import WebsiteVisit

# ── Pure classification ───────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("host", "medium", "source", "expected"),
    [
        (None, None, None, "direct"),
        ("www.google.com".removeprefix("www."), None, None, "organic"),
        ("l.facebook.com", None, None, "social"),
        ("t.co", None, None, "social"),
        ("someblog.rw", None, None, "referral"),
        ("google.com", "cpc", "google", "paid"),
        (None, "social", "newsletter", "social"),
        (None, "email", "newsletter", "other"),
    ],
)
def test_classify_channel(host, medium, source, expected):
    assert classify.classify_channel(host, medium, source) == expected


def test_clean_path_drops_query_and_rejects_bad_paths():
    assert classify.clean_path("/pricing/?token=abc#x") == "/pricing"
    assert classify.clean_path("/") == "/"
    assert classify.clean_path("//evil.com") is None
    assert classify.clean_path("pricing") is None
    assert classify.clean_path("/" + "a" * 300) is None


def test_referrer_host_ignores_own_site():
    assert classify.referrer_host("https://www.pesaa.io/x", {"pesaa.io"}) is None
    assert classify.referrer_host("https://news.example.com/a", {"pesaa.io"}) == "news.example.com"
    assert classify.referrer_host(None, set()) is None


def test_bots_and_missing_user_agents_are_ignored():
    assert classify.is_bot("Googlebot/2.1") and classify.is_bot(None)
    assert not classify.is_bot("Mozilla/5.0 (Macintosh) AppleWebKit Safari")


# ── Report (real database, rolled back) ───────────────────────────────────────

@pytest.mark.db
async def test_report_counts_attribution_and_empty_state(db, monkeypatch):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.modules.admin import analytics
    from app.modules.tenants.models import Tenant

    monkeypatch.setattr(analytics, "AsyncSessionLocal", async_sessionmaker(bind=db.bind, expire_on_commit=False))

    async def sequential(*aws):  # the test shares one connection, which cannot run queries concurrently
        return [await a for a in aws]

    monkeypatch.setattr(service.asyncio, "gather", sequential)
    now = datetime.now(UTC)
    vid = "a" * 20
    db.add_all([
        WebsiteVisit(visitor_id=vid, path="/pricing", channel="paid", utm_campaign="launch", created_at=now - timedelta(hours=2)),
        WebsiteVisit(visitor_id=vid, path="/", channel="paid", utm_campaign="launch", created_at=now - timedelta(hours=1)),
        WebsiteVisit(visitor_id="b" * 20, path="/", channel="direct", created_at=now - timedelta(hours=1)),
    ])
    db.add(Tenant(name="Track Co", slug="track-co-traffic", attribution_visitor_id=vid))
    await db.flush()
    from app.core import cache
    cache.invalidate_cache("admin-analytics")

    report = await service.traffic_report(resolve_period(None, None))
    assert report["kpis"]["visitors"]["value"] >= 2
    assert {s["channel"] for s in report["sources"]} == set(classify.CHANNELS)
    assert report["funnelNote"]["signupsTracked"] >= 1
    assert any(c["campaign"] == "launch" and c["signups"] >= 1 for c in report["campaigns"])
    assert any(p["path"] == "/pricing" and p["signups"] >= 1 for p in report["pages"])


# ── HTTP: beacon, registration link, admin-only access ────────────────────────

@pytest.mark.db
async def test_beacon_records_visit_register_links_it_and_report_is_admin_only(db, monkeypatch):
    import uuid

    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import select

    from app.core import cache
    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app
    from app.modules.admin import analytics
    from app.modules.auth import service as auth_service
    from app.modules.auth.schemas import RegisterRequest
    from app.modules.tenants.models import Tenant, User

    async def sequential(*aws):
        return [await a for a in aws]

    from sqlalchemy.ext.asyncio import async_sessionmaker

    monkeypatch.setattr(service.asyncio, "gather", sequential)
    monkeypatch.setattr(analytics, "AsyncSessionLocal", async_sessionmaker(bind=db.bind, expire_on_commit=False))
    cache.invalidate_cache("admin-analytics")

    vid = uuid.uuid4().hex + "ab"
    n = uuid.uuid4().hex[:8]
    admin = User(email=f"{n}@pesaa.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    owner = User(email=f"o{n}@pesaa.test", hashed_password="x", full_name="Owner", role="owner", tenant_id=None, is_superuser=False, is_active=True)
    db.add_all([admin, owner])
    await db.flush()
    current = {"user": admin}

    async def _db():
        yield db

    async def _user():
        return current["user"]

    app.dependency_overrides[get_db], app.dependency_overrides[get_current_user] = _db, _user
    human = {"user-agent": "Mozilla/5.0 (Macintosh) Safari", "origin": "https://pesaa.io"}
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t") as c:
            ok = await c.post("/api/v1/public/visits", headers=human, json={
                "visitor_id": vid, "path": "/pricing?token=secret", "referrer": "https://www.google.com/",
                "utm_campaign": "Launch", "utm_medium": "cpc"})
            bot = await c.post("/api/v1/public/visits", headers={"user-agent": "Googlebot/2.1"}, json={"visitor_id": "z" * 20, "path": "/"})
            bad = await c.post("/api/v1/public/visits", headers=human, json={"visitor_id": "short", "path": "/"})
            assert ok.status_code == bot.status_code == bad.status_code == 204

            stored = (await db.execute(select(WebsiteVisit).where(WebsiteVisit.visitor_id.in_([vid, "z" * 20, "short"])))).scalars().all()
            assert [(v.path, v.channel, v.utm_campaign, v.referrer_host) for v in stored] == [("/pricing", "paid", "launch", "google.com")]

            await auth_service.register(db, RegisterRequest(
                tenant_name=f"Attr {n}", tenant_slug=f"attr-{n}", email=f"a{n}@example.com", full_name="Owner One",
                password="Passw0rd!x", visitor_id=vid))
            tenant = (await db.execute(select(Tenant).where(Tenant.slug == f"attr-{n}"))).scalars().one()
            assert tenant.attribution_visitor_id == vid
            forged = await auth_service.register(db, RegisterRequest(
                tenant_name=f"Forged {n}", tenant_slug=f"forged-{n}", email=f"f{n}@example.com", full_name="Owner One",
                password="Passw0rd!x", visitor_id="not a valid id!"))
            assert (await db.execute(select(Tenant.attribution_visitor_id).where(Tenant.slug == forged.tenant_slug))).scalar_one() is None

            cache.invalidate_cache("admin-analytics")
            report = (await c.get("/api/v1/admin/analytics/traffic")).json()["data"]
            assert report["trackingActive"] is True
            assert any(p["path"] == "/pricing" and p["signups"] >= 1 for p in report["pages"])
            assert all("previous" in row for row in report["series"])

            live = (await c.get("/api/v1/admin/analytics/traffic/realtime")).json()["data"]
            assert live["activeNow"] >= 1 and len(live["hourly"]) == 48
            assert any(p["path"] == "/pricing" for p in live["activePages"])

            for kind in ("sources", "pages", "campaigns"):
                detail = (await c.get(f"/api/v1/admin/analytics/traffic/{kind}")).json()["data"]
                assert detail["period"]["days"] >= 1
            camps = (await c.get("/api/v1/admin/analytics/traffic/campaigns")).json()["data"]
            assert any(x["campaign"] == "launch" and x["signups"] >= 1 for x in camps["campaigns"])
            assert any(x["source"] is None and x["medium"] == "cpc" for x in camps["sources"])
            srcs = (await c.get("/api/v1/admin/analytics/traffic/sources")).json()["data"]
            assert {x["channel"] for x in srcs["channels"]} == set(classify.CHANNELS)
            assert any(x["host"] == "google.com" for x in srcs["referrers"])

            current["user"] = owner
            denied = await c.get("/api/v1/admin/analytics/traffic")
            assert denied.status_code in (401, 403)
    finally:
        app.dependency_overrides.clear()
