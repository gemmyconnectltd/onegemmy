import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.email import EmailDeliveryError
from app.core.exceptions import ValidationError
from app.modules.marketing import automations, campaigns, contacts, engine, render, tracking
from app.modules.marketing import settings as mkt_settings
from app.modules.marketing.models import MarketingContact, MarketingSend

# ── Pure: rendering, validation, addresses ───────────────────────────────────

def test_render_escapes_content_and_always_adds_unsubscribe():
    blocks = render.clean_blocks([
        {"type": "heading", "props": {"text": "Hi {{first_name}} <script>x</script>", "level": 1}},
        {"type": "paragraph", "props": {"text": "**Bold** and [a link](https://pesaa.io/pricing)\nsecond line"}},
        {"type": "button", "props": {"label": "Go", "url": "https://pesaa.io"}},
    ])
    html, text = render.render_email(blocks, subject="S", preheader="P")
    filled = render.personalize(html, {"first_name": "A<b>", "unsubscribe_url": "https://u/1"}, html_mode=True)
    assert "<script>" not in filled and "A&lt;b&gt;" in filled
    assert 'href="https://u/1"' in filled and "<strong>Bold</strong>" in filled and "second line" in text
    assert "Unsubscribe: https://u/1" in render.personalize(text, {"unsubscribe_url": "https://u/1"}, html_mode=False)


@pytest.mark.parametrize("bad", [{"type": "button", "props": {"label": "x", "url": "javascript:alert(1)"}},
                                 {"type": "image", "props": {"url": "data:image/png;base64,AAA"}}, {"type": "script", "props": {}}])
def test_blocks_reject_unsafe_links_and_unknown_types(bad):
    with pytest.raises(ValidationError):
        render.clean_blocks([bad])


def test_unknown_variables_are_reported():
    assert render.unknown_variables("Hi {{first_name}} {{nope}}") == ["nope"]


@pytest.mark.parametrize(("raw", "ok"), [("a@gmail.com", True), ("A@Gmail.com ", True), ("x@prodcopy.test", False), ("x@example.com", False),
                                         ("not-an-email", False), ("", False), ("y@site.invalid", False)])
def test_check_email(raw, ok):
    email, reason = contacts.check_email(raw)
    assert (reason is None) is ok and (not ok or email == raw.strip().lower())


def test_schedule_next_run_is_in_the_future():
    now = datetime(2026, 10, 25, 12, 0, tzinfo=UTC)
    for sched in ({"frequency": "weekly", "weekday": 0, "hour": 9}, {"frequency": "monthly", "day": 1, "hour": 9}):
        assert campaigns.next_run(sched, now) > now
    assert campaigns.next_run({"frequency": "weekly", "weekday": 6, "hour": 9}, now).weekday() == 6


# ── DB helpers ────────────────────────────────────────────────────────────────

def _contact(**kw) -> MarketingContact:
    n = uuid.uuid4().hex[:8]
    base = {"email": f"{n}@gmail.com", "name": "Test Person", "business_name": f"Biz {n}", "source": "import", "consent": "subscribed", "consent_source": "test"}
    return MarketingContact(**{**base, **kw})


async def _provider(monkeypatch, db, *, safe: bool = False, allow: str = ""):
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.modules.admin import analytics as admin_analytics

    monkeypatch.setattr(mkt_settings, "outbound_configured", lambda: True)
    monkeypatch.setattr(engine, "safe_mode", lambda: safe)
    monkeypatch.setattr(contacts, "safe_recipients", lambda: {e for e in allow.split(",") if e})
    monkeypatch.setattr(admin_analytics, "AsyncSessionLocal", async_sessionmaker(bind=db.bind, expire_on_commit=False))
    monkeypatch.setattr(engine, "AsyncSessionLocal", async_sessionmaker(bind=db.bind, expire_on_commit=False))


async def _only_my_contacts(db, monkeypatch, ids):
    """Restricts every audience to these contacts so existing rows in a dev database never affect a test."""
    orig, orig_elig = contacts.filter_conditions, contacts.eligibility
    monkeypatch.setattr(contacts, "filter_conditions", lambda f: [*orig(f), MarketingContact.id.in_(ids)])
    monkeypatch.setattr(contacts, "eligibility", lambda mode, **kw: [*orig_elig(mode, **kw), MarketingContact.id.in_(ids)])


class _Fake:
    def __init__(self, error: Exception | None = None):
        self.calls, self.error = [], error

    async def __call__(self, to, subject, html_body, text_body=None, reply_to=None, sender="accounts", headers=None, **kw):
        self.calls.append({"to": to, "subject": subject, "html": html_body, "headers": headers or {}})
        if self.error:
            raise self.error
        return "<mid@test>"


@pytest.mark.db
async def test_import_validates_dedupes_and_never_resubscribes(db):
    n = uuid.uuid4().hex[:6]
    unsub = _contact(email=f"gone{n}@gmail.com", status="unsubscribed")
    db.add(unsub)
    await db.flush()
    csv_text = (f"email,name,company,tags\nok{n}@gmail.com,Ann,Ann Ltd,vip\nOK{n}@gmail.com,Ann again,,\nbad-email,Bob,,\nx{n}@prodcopy.test,Test,,\n"
                f"gone{n}@gmail.com,Gone,,\n")
    dry = await contacts.import_preview_or_run(db, csv_text, consent_source="Event sign-up sheet", tags=["expo"], dry_run=True)
    assert (dry["new"], dry["duplicate_in_file"], dry["invalid"], dry["suppressed"]) == (1, 1, 2, 1)
    assert (await db.execute(select(MarketingContact).where(MarketingContact.email == f"ok{n}@gmail.com"))).first() is None  # dry run writes nothing
    await contacts.import_preview_or_run(db, csv_text, consent_source="Event sign-up sheet", tags=["expo"], dry_run=False)
    c = (await db.execute(select(MarketingContact).where(MarketingContact.email == f"ok{n}@gmail.com"))).scalar_one()
    assert c.consent == "subscribed" and c.consent_source == "Event sign-up sheet" and c.tags == ["expo", "vip"] and c.source == "import"
    await db.refresh(unsub)
    assert unsub.status == "unsubscribed"


@pytest.mark.db
async def test_eligibility_rules(db):
    ok = _contact()
    unsub, bounced, invalid, no_consent = _contact(status="unsubscribed"), _contact(status="bounced"), _contact(email_valid=False), _contact(consent="unknown")
    news = _contact(newsletter_subscribed=True)
    db.add_all([ok, unsub, bounced, invalid, no_consent, news])
    await db.flush()
    ids = [c.id for c in (ok, unsub, bounced, invalid, no_consent, news)]

    async def eligible(mode, **kw):
        rows = (await db.execute(contacts.contact_select(MarketingContact.id).where(MarketingContact.id.in_(ids), *contacts.eligibility(mode, **kw)))).scalars().all()
        return set(rows)

    assert await eligible("opt_out") == {ok.id, news.id}  # imported leads always need recorded consent
    assert await eligible("opt_in") == {ok.id, news.id}
    assert await eligible("opt_out", newsletter=True) == {news.id}
    s = await contacts.audience_summary(db, {"q": "@"}, "opt_out")
    assert s["eligible"] >= 2 and s["excluded"]["unsubscribed"] >= 1 and s["excluded"]["bounced_or_complained"] >= 1 and s["excluded"]["invalid_email"] >= 1


@pytest.mark.db
async def test_campaign_lifecycle_is_single_shot_and_freezes_content(db, monkeypatch):
    await _provider(monkeypatch, db)
    people = [_contact() for _ in range(3)]
    db.add_all(people)
    await db.flush()
    await _only_my_contacts(db, monkeypatch, [p.id for p in people])
    from app.modules.tenants.models import User

    user = User(email=f"{uuid.uuid4().hex[:8]}@pesaa.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    db.add(user)
    await db.flush()
    c = await campaigns.create(db, user.id, {"name": "Launch", "subject": "Hello {{first_name}}", "blocks": [
        {"type": "paragraph", "props": {"text": "Hi"}}], "audience": {"filters": {}}})
    ready = await campaigns.readiness(db, c)
    assert ready["canSend"] and ready["audience"]["eligible"] == 3
    c = await campaigns.start_sending(db, c.id, actor="t")
    assert c.status == "sending" and c.recipient_count == 3
    sends = (await db.execute(select(MarketingSend).where(MarketingSend.campaign_id == c.id))).scalars().all()
    assert len(sends) == 3 and {s.status for s in sends} == {"pending"}
    with pytest.raises(ValidationError):  # second click: already sending
        await campaigns.start_sending(db, c.id, actor="t")
    with pytest.raises(ValidationError):  # content is frozen once sending starts
        await campaigns.update_campaign(db, c.id, {"subject": "Changed"})
    await campaigns.set_state(db, c.id, "cancel")
    assert {s.status for s in (await db.execute(select(MarketingSend).where(MarketingSend.campaign_id == c.id))).scalars().all()} == {"skipped"}


@pytest.mark.db
async def test_process_send_outcomes_and_safeguards(db, monkeypatch):
    await _provider(monkeypatch, db)
    person = _contact()
    db.add(person)
    await db.flush()
    from app.modules.marketing.models import MarketingCampaign

    camp = MarketingCampaign(name="T", subject="Hi {{first_name}}", status="sending", blocks=render.clean_blocks([
        {"type": "paragraph", "props": {"text": "Hello {{business_name}}"}}, {"type": "button", "props": {"label": "Go", "url": "https://pesaa.io/x"}}]))
    db.add(camp)
    await db.flush()

    async def make_send() -> MarketingSend:
        s = MarketingSend(campaign_id=camp.id, contact_id=person.id, email=person.email, status="sending")
        db.add(s)
        await db.flush()
        return s

    fake = _Fake()
    monkeypatch.setattr(engine, "send_email_message", fake)
    s = await make_send()
    assert await engine.process_send(db, s) == "sent" and s.message_id == "<mid@test>" and s.sent_at
    sent = fake.calls[0]
    assert sent["subject"].startswith("Hi ") and "List-Unsubscribe" in sent["headers"] and "/global/m/u/" in sent["headers"]["List-Unsubscribe"]
    assert "/global/m/c/" in sent["html"] and "/global/m/o/" in sent["html"] and "utm_medium" not in sent["html"].split("/c/")[0]

    await db.delete(s)
    await db.flush()
    person.status = "unsubscribed"  # unsubscribed after the campaign was queued
    s = await make_send()
    assert await engine.process_send(db, s) == "skipped" and len(fake.calls) == 1
    await db.delete(s)
    await db.flush()
    person.status = "active"

    monkeypatch.setattr(engine, "safe_mode", lambda: True)  # non-production: only allow-listed addresses
    s = await make_send()
    assert await engine.process_send(db, s) == "skipped" and "Safe mode" in (s.reason or "") and len(fake.calls) == 1
    await db.delete(s)
    await db.flush()
    monkeypatch.setattr(contacts, "safe_recipients", lambda: {person.email})
    s = await make_send()
    assert await engine.process_send(db, s) == "sent"
    await db.delete(s)
    await db.flush()

    monkeypatch.setattr(engine, "send_email_message", _Fake(EmailDeliveryError(rejected=True)))
    s = await make_send()
    assert await engine.process_send(db, s) == "bounced" and person.status == "bounced"
    await db.delete(s)
    await db.flush()
    person.status = "active"
    monkeypatch.setattr(engine, "send_email_message", _Fake(EmailDeliveryError(retryable=True)))
    s = await make_send()
    assert await engine.process_send(db, s) == "pending" and s.attempts == 1 and s.next_attempt_at > datetime.now(UTC)
    await db.delete(s)
    await db.flush()
    monkeypatch.setattr(engine, "send_email_message", _Fake(EmailDeliveryError(uncertain=True)))
    s = await make_send()
    assert await engine.process_send(db, s) == "failed" and "uncertain" in (s.reason or "").lower()


@pytest.mark.db
async def test_tracking_links_open_and_unsubscribe(db):
    person = _contact()
    db.add(person)
    await db.flush()
    send = MarketingSend(contact_id=person.id, email=person.email, status="sent")
    db.add(send)
    await db.flush()
    html = f'<a href="https://pesaa.io/pricing?a=1">p</a><a href="https://other.com/x">o</a><a href="{tracking.unsubscribe_url(person.id, send.id)}">u</a></body>'
    out = tracking.instrument(html, send.id, "email-x-abc123")
    assert out.count("/global/m/c/") == 2 and tracking.unsubscribe_url(person.id, send.id) in out and f"/o/{send.id}.gif" in out
    token = out.split("/global/m/c/")[1].split('"')[0]
    sid, url = tracking.read_click(token)
    assert sid == send.id and url.startswith("https://pesaa.io/pricing") and "utm_campaign=email-x-abc123" in url
    assert tracking.read_click(token[:-3] + "abc") is None  # tampered token is never followed
    await tracking.record(db, send.id, "click", url)
    await tracking.record(db, send.id, "open")
    await db.refresh(send)
    assert (send.clicks, send.opens) == (1, 1)
    assert tracking.read_unsubscribe("garbage") is None
    assert await tracking.unsubscribe(db, person.id, send.id)
    await db.refresh(person)
    await db.refresh(send)
    assert person.status == "unsubscribed" and send.unsubscribed_at is not None


@pytest.mark.db
async def test_automations_only_act_after_activation_and_send_once(db, monkeypatch):
    await _provider(monkeypatch, db)
    from app.modules.tenants.models import Tenant, User

    user = User(email=f"{uuid.uuid4().hex[:8]}@pesaa.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    db.add(user)
    n = uuid.uuid4().hex[:6]
    old = Tenant(name=f"Old {n}", slug=f"old-{n}", is_active=True, created_at=datetime.now(UTC) - timedelta(days=10))
    db.add(old)
    await db.flush()
    owner = User(email=f"o{n}@gmail.com", hashed_password="x", full_name="Old Owner", role="owner", tenant_id=old.id, is_active=True)
    db.add(owner)
    await db.flush()
    await contacts.sync_tenant_contacts(db)
    old_contact = (await db.execute(select(MarketingContact).where(MarketingContact.tenant_id == old.id))).scalar_one()
    await _only_my_contacts(db, monkeypatch, [old_contact.id])
    a = await automations.create(db, user.id, "welcome", {"subject": "Welcome", "blocks": [{"type": "paragraph", "props": {"text": "Hi"}}]})
    with pytest.raises(ValidationError):  # no subject/content yet
        empty = await automations.create(db, user.id, "welcome", {})
        await automations.set_active(db, empty.id, True)
    await automations.set_active(db, a.id, True)
    assert await automations.enqueue(db, a) == 0  # the business signed up BEFORE activation: no back-catalogue blast
    old.created_at = datetime.now(UTC) + timedelta(seconds=1)  # a signup after activation
    old.created_at = a.activated_at + timedelta(seconds=1)
    await db.flush()
    monkeypatch.setattr(automations, "datetime", type("D", (), {"now": staticmethod(lambda tz=None: a.activated_at + timedelta(hours=1))}))
    assert await automations.enqueue(db, a) == 1
    assert await automations.enqueue(db, a) == 0  # exactly once per contact
    assert automations.describe_trigger(a)


# ── HTTP: permissions and the public tracking endpoints ──────────────────────

@pytest.mark.db
async def test_http_admin_only_and_public_links(db, monkeypatch):
    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app
    from app.modules.tenants.models import User

    await _provider(monkeypatch, db)
    n = uuid.uuid4().hex[:8]
    admin = User(email=f"a{n}@pesaa.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    staff = User(email=f"s{n}@pesaa.test", hashed_password="x", full_name="Staff", role="member", tenant_id=None, is_superuser=False, is_active=True)
    db.add_all([admin, staff])
    person = _contact()
    db.add(person)
    await db.flush()
    current = {"user": staff}

    async def _db():
        yield db

    async def _user():
        return current["user"]

    app.dependency_overrides[get_db], app.dependency_overrides[get_current_user] = _db, _user
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t") as c:
            for path in ("overview", "contacts", "templates", "campaigns", "automations", "analytics", "settings", "settings/suppressions", "segments"):
                assert (await c.get(f"/api/v1/admin/marketing/{path}")).status_code in (401, 403), path  # not a platform admin
            current["user"] = admin
            for path in ("overview", "contacts", "contacts/options", "templates", "campaigns", "campaigns?kind=newsletter", "automations", "analytics", "settings",
                         "settings/suppressions", "settings/audit", "segments"):
                r = await c.get(f"/api/v1/admin/marketing/{path}")
                assert r.status_code == 200, (path, r.text[:200])
            tpls = (await c.get("/api/v1/admin/marketing/templates")).json()["data"]
            assert len(tpls) >= 6 and all(t["is_system"] for t in tpls[:6])
            rendered = (await c.post("/api/v1/admin/marketing/render", json={"blocks": tpls[0]["blocks"], "subject": tpls[0]["subject"]})).json()["data"]
            assert "Unsubscribe" in rendered["html"] and "{{" not in rendered["html"]
            created = (await c.post("/api/v1/admin/marketing/campaigns", json={"name": "HTTP", "subject": "S", "blocks": tpls[0]["blocks"]})).json()["data"]
            assert created["status"] == "draft"
            assert (await c.post(f"/api/v1/admin/marketing/campaigns/{created['id']}/send", json={"confirm_recipients": 0})).status_code == 422

            send = MarketingSend(contact_id=person.id, email=person.email, status="sent")
            db.add(send)
            await db.flush()
            bad = await c.get("/api/v1/global/m/c/not-a-token")
            assert bad.status_code == 400
            link = tracking.click_token(send.id, "https://pesaa.io/pricing")
            ok = await c.get(f"/api/v1/global/m/c/{link}", follow_redirects=False)
            assert ok.status_code == 302 and ok.headers["location"] == "https://pesaa.io/pricing"
            assert (await c.get(f"/api/v1/global/m/o/{send.id}.gif")).headers["content-type"] == "image/gif"
            tok = tracking.unsubscribe_token(person.id, send.id)
            page = await c.get(f"/api/v1/global/m/u/{tok}")  # a scanner opening the link must not unsubscribe anyone
            assert page.status_code == 200 and "Confirm" not in page.text
            await db.refresh(person)
            assert person.status == "active"
            done = await c.post(f"/api/v1/global/m/u/{tok}")
            assert done.status_code == 200
            await db.refresh(person)
            assert person.status == "unsubscribed"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_every_automation_trigger_query_runs(db, monkeypatch):
    await _provider(monkeypatch, db)
    from app.modules.tenants.models import User

    user = User(email=f"{uuid.uuid4().hex[:8]}@pesaa.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    db.add(user)
    await db.flush()
    await _only_my_contacts(db, monkeypatch, [uuid.uuid4()])
    for kind in automations.KINDS:
        a = await automations.create(db, user.id, kind, {"subject": "S", "blocks": [{"type": "paragraph", "props": {"text": "Hi"}}]})
        await automations.set_active(db, a.id, True)
        assert await automations.enqueue(db, a) == 0  # runs the real SQL for the trigger; nobody matches the isolated audience
    assert set((await automations.stats(db, [a.id])).keys()) <= {a.id}


@pytest.mark.db
async def test_http_send_flow_creates_outbox_and_audit(db, monkeypatch):
    from httpx import ASGITransport, AsyncClient

    from app.core.database import get_db
    from app.core.deps import get_current_user
    from app.main import app
    from app.modules.audit.models import AuditLog
    from app.modules.tenants.models import User

    await _provider(monkeypatch, db)
    people = [_contact() for _ in range(2)]
    admin = User(email=f"a{uuid.uuid4().hex[:8]}@pesaa.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    db.add_all([*people, admin])
    await db.flush()
    await _only_my_contacts(db, monkeypatch, [p.id for p in people])

    async def _db():
        yield db

    async def _user():
        return admin

    app.dependency_overrides[get_db], app.dependency_overrides[get_current_user] = _db, _user
    try:
        async with AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=True), base_url="http://t") as c:
            tpl = (await c.get("/api/v1/admin/marketing/templates")).json()["data"][0]
            made = (await c.post("/api/v1/admin/marketing/campaigns", json={"name": "Flow", "subject": "Hi", "blocks": tpl["blocks"]})).json()["data"]
            ready = (await c.get(f"/api/v1/admin/marketing/campaigns/{made['id']}/readiness")).json()["data"]
            assert ready["audience"]["eligible"] == 2
            wrong = await c.post(f"/api/v1/admin/marketing/campaigns/{made['id']}/send", json={"confirm_recipients": 5})
            assert wrong.status_code == 422  # the admin confirmed a different audience size than the one now eligible
            ok = await c.post(f"/api/v1/admin/marketing/campaigns/{made['id']}/send", json={"confirm_recipients": 2})
            assert ok.status_code == 200 and ok.json()["data"]["status"] == "sending" and ok.json()["data"]["recipient_count"] == 2
            again = await c.post(f"/api/v1/admin/marketing/campaigns/{made['id']}/send", json={"confirm_recipients": 2})
            assert again.status_code == 422  # a second click can't start it twice
            res = (await c.get(f"/api/v1/admin/marketing/campaigns/{made['id']}/results")).json()["data"]
            assert res["total"] == 2 and res["queued"] == 2
            audit = (await db.execute(select(AuditLog).where(AuditLog.action == "marketing.campaign.send", AuditLog.entity_id == made["id"]))).scalars().all()
            assert len(audit) == 1
    finally:
        app.dependency_overrides.clear()
