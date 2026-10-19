"""Support center: ingest/dedup/threading, tickets, permissions, tenant isolation, webhook protection.

Everything runs in a rolled-back transaction (see conftest.py). External services (OpenWA, Graph, SMTP) are NOT
contacted — these tests cover Pesaa's own logic; they do not prove the live WhatsApp/Outlook integrations."""
import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.main import app
from app.modules.support import email_inbound, messaging, openwa, service
from app.modules.support.deps import get_support_staff, require_manager
from app.modules.support.models import SupportConversation, SupportMessage
from app.modules.support.schemas import SupportSettingsIO
from app.modules.tenants.models import Tenant, User

pytestmark = pytest.mark.db


async def make_user(db, role="support_agent", tenant=None, superuser=False, email=None, phone=None):
    u = User(email=email or f"{uuid.uuid4().hex[:8]}@test.local", hashed_password="x", full_name=f"{role} {uuid.uuid4().hex[:4]}", role=role,
             tenant_id=tenant.id if tenant else None, is_superuser=superuser, is_active=True, phone=phone)
    db.add(u)
    await db.flush()
    return u


async def make_tenant(db):
    t = Tenant(name=f"T-{uuid.uuid4().hex[:6]}", slug=f"t-{uuid.uuid4().hex[:10]}", currency="RWF")
    db.add(t)
    await db.flush()
    return t


async def wa_in(db, phone="250788123456", text="Hello", mid=None, name="Customer"):
    return await service.ingest_incoming(db, channel="whatsapp", thread_id=f"{phone}@c.us", provider_message_id=mid or f"wa-{uuid.uuid4().hex}",
                                         body=text, customer_name=name, customer_phone=phone)


# ── WhatsApp ingest ───────────────────────────────────────────────────────────────────────────────────────────

async def test_incoming_whatsapp_creates_one_conversation_and_counts_unread(db):
    _, conv, created = await wa_in(db, text="Hi")
    _, conv2, created2 = await wa_in(db, text="Anyone there?")
    assert created and not created2 and conv.id == conv2.id
    assert conv.unread_count == 2 and conv.last_message_preview == "Anyone there?" and conv.channel == "whatsapp"


async def test_duplicate_provider_message_is_ignored(db):
    await wa_in(db, mid="abc")
    msg, _, created = await wa_in(db, mid="abc")
    assert msg is None and created is False
    count = (await db.execute(select(func.count()).select_from(SupportMessage).where(SupportMessage.provider_message_id == "abc"))).scalar_one()
    assert count == 1


async def test_customer_reply_reopens_a_resolved_conversation_and_its_ticket(db):
    agent = await make_user(db)
    _, conv, _ = await wa_in(db)
    ticket, _ = await service.create_ticket_from_conversation(db, agent, conv)
    await service.set_conversation_status(db, agent, conv, "resolved")
    await db.refresh(ticket)
    assert conv.status == "resolved" and ticket.status == "resolved"
    await wa_in(db, text="One more thing")
    await db.refresh(ticket)
    assert conv.status == "open" and ticket.status == "open"


async def test_phone_number_links_the_conversation_to_a_business(db):
    t = await make_tenant(db)
    await make_user(db, "member", tenant=t, phone="+250 788 123 456")
    _, conv, _ = await wa_in(db, phone="250788123456")
    assert conv.tenant_id == t.id


# ── webhook payloads, signature, delivery status ──────────────────────────────────────────────────────────────

def test_signature_is_hmac_sha256_of_the_raw_body():
    body = b'{"a":1}'
    good = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert openwa.verify_signature(body, good, "s3cret")
    assert not openwa.verify_signature(body, good, "other") and not openwa.verify_signature(body, None, "s3cret")
    assert not openwa.verify_signature(body + b" ", good, "s3cret") and not openwa.verify_signature(body, good, "")


def test_parse_webhook_handles_messages_groups_and_statuses():
    ev = openwa.parse_webhook("message.received", {"data": {"id": "M1", "chatId": "250788000111@c.us", "body": "hi", "fromMe": False, "pushName": "Ama"}})
    assert ev.kind == "received" and ev.phone == "250788000111" and ev.body == "hi" and ev.name == "Ama"
    assert openwa.parse_webhook("message.received", {"data": {"id": "M2", "chatId": "123-456@g.us", "body": "x"}}) is None     # group
    assert openwa.parse_webhook("message.received", {"data": {"id": "M3", "chatId": "status@broadcast", "body": "x"}}) is None
    assert openwa.parse_webhook("message.failed", {"data": {"id": "M1", "error": "boom"}}).status == "failed"
    assert openwa.parse_webhook("message.ack", {"data": {"id": "M1", "ack": 3}}).status == "read"
    assert openwa.parse_webhook("session.status", {"data": {"status": "ready"}}).session_status == "ready"
    assert openwa.parse_webhook("call.received", {"data": {}}) is None


async def test_delivery_status_only_moves_forward_and_failed_is_terminal(db):
    agent = await make_user(db)
    _, conv, _ = await wa_in(db)
    msg = await service.record_outgoing(db, agent, conv, "reply", None, delivery_status="sent", provider="whatsapp", provider_message_id="out-1")
    assert await service.update_delivery(db, "whatsapp", "out-1", "read")
    assert not await service.update_delivery(db, "whatsapp", "out-1", "delivered")        # can't go backwards
    assert not await service.update_delivery(db, "whatsapp", "out-1", "failed", "x")      # already read: can't fail
    await db.refresh(msg)
    assert msg.delivery_status == "read"
    bad = await service.record_outgoing(db, agent, conv, "second", None, delivery_status="sent", provider="whatsapp", provider_message_id="out-2")
    assert await service.update_delivery(db, "whatsapp", "out-2", "failed", "no network")
    assert not await service.update_delivery(db, "whatsapp", "out-2", "delivered")        # failed is terminal
    await db.refresh(bad)
    assert bad.delivery_status == "failed" and bad.delivery_error == "no network"


async def _client(db, user=None):
    async def _db():
        yield db
    app.dependency_overrides[get_db] = _db
    if user is not None:
        async def _user():
            return user
        app.dependency_overrides[get_current_user] = _user
    return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t")


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()


async def test_webhook_rejects_bad_signatures_and_ignores_duplicate_deliveries(db, monkeypatch):
    monkeypatch.setattr(settings, "OPENWA_WEBHOOK_SECRET", "topsecret")
    body = json.dumps({"event": "message.received", "data": {"id": "WA-77", "chatId": "250788555000@c.us", "body": "Muraho", "pushName": "Kim"}}).encode()
    sig = "sha256=" + hmac.new(b"topsecret", body, hashlib.sha256).hexdigest()
    headers = {"x-openwa-event": "message.received", "x-openwa-delivery-id": f"d-{uuid.uuid4().hex}", "content-type": "application/json"}
    async with await _client(db) as c:
        bad = await c.post("/api/v1/support/webhooks/openwa", content=body, headers={**headers, "x-openwa-signature": "sha256=deadbeef"})
        assert bad.status_code == 403
        ok = await c.post("/api/v1/support/webhooks/openwa", content=body, headers={**headers, "x-openwa-signature": sig})
        assert ok.status_code == 200
        again = await c.post("/api/v1/support/webhooks/openwa", content=body, headers={**headers, "x-openwa-signature": sig})
        assert again.status_code == 200 and again.json().get("duplicate") is True
    n = (await db.execute(select(func.count()).select_from(SupportMessage).where(SupportMessage.provider_message_id == "WA-77"))).scalar_one()
    assert n == 1


# ── email ─────────────────────────────────────────────────────────────────────────────────────────────────────

def _mail(mid, sender="client@example.com", subject="Invoice question", body="Hello", **kw):
    return email_inbound.EmailIn(message_id=mid, sender_email=sender, sender_name="Client", subject=subject, body=body, **kw)


async def test_email_reply_threads_onto_the_same_conversation_not_a_new_one(db):
    ok, conv = await email_inbound.ingest_email(db, _mail("<a1@x>", body="First question"))
    assert ok
    ok2, conv2 = await email_inbound.ingest_email(db, _mail("<a2@x>", subject="RE: Invoice question", in_reply_to="<a1@x>", references=["<a1@x>"],
                                                            body="Thanks!\n\nOn Mon, 5 Oct 2026 at 10:00, Pesaa wrote:\n> old text"))
    assert ok2 and conv2.id == conv.id
    msgs = (await db.execute(select(SupportMessage).where(SupportMessage.conversation_id == conv.id).order_by(SupportMessage.created_at))).scalars().all()
    assert [m.body for m in msgs] == ["First question", "Thanks!"]                    # quoted history stripped


async def test_email_threads_by_subject_and_sender_and_dedupes_by_message_id(db):
    _, conv = await email_inbound.ingest_email(db, _mail("<b1@x>", subject="Login problem"))
    _, same = await email_inbound.ingest_email(db, _mail("<b2@x>", subject="Re: Login problem"))
    _, new = await email_inbound.ingest_email(db, _mail("<b3@x>", subject="Something else"))
    assert same.id == conv.id and new.id != conv.id
    dup, _ = await email_inbound.ingest_email(db, _mail("<b2@x>", subject="Re: Login problem"))
    assert dup is False


async def test_our_own_mailbox_is_never_imported_and_automated_mail_is_detected(db, monkeypatch):
    monkeypatch.setattr(settings, "SUPPORT_MAILBOX", "support@pesaa.io")
    imported, _ = await email_inbound.ingest_email(db, _mail("<c1@x>", sender="support@pesaa.io"))
    assert imported is False
    assert service.is_automated_sender("noreply@bank.com") and service.is_automated_sender("a@b.com", {"Auto-Submitted": "auto-generated"})
    assert service.is_automated_sender("a@b.com", {"Precedence": "bulk"}) and not service.is_automated_sender("person@b.com", {"Auto-Submitted": "no"})


async def test_email_attachments_are_stored_safely_and_unsupported_types_are_skipped(db, tmp_path, monkeypatch):
    monkeypatch.setattr(service, "UPLOAD_ROOT", tmp_path)
    m = _mail("<d1@x>", body="see file")
    m.attachments = [{"name": "../../evil.pdf", "mime": "application/pdf", "data": b"%PDF-1"}, {"name": "x.exe", "mime": "application/x-msdownload", "data": b"MZ"}]
    ok, conv = await email_inbound.ingest_email(db, m)
    msg = (await db.execute(select(SupportMessage).where(SupportMessage.conversation_id == conv.id))).scalars().one()
    assert ok and len(msg.attachments) == 1 and msg.attachments[0]["name"] == "evil.pdf"
    assert service.attachment_file(msg.attachments[0]).read_bytes() == b"%PDF-1"
    with pytest.raises(ValidationError):
        service.save_attachment(b"x" * (service.MAX_ATTACHMENT_BYTES + 1), "big.pdf", "application/pdf")


# ── automation ────────────────────────────────────────────────────────────────────────────────────────────────

async def test_acknowledgement_is_sent_once_never_to_automated_senders_and_not_twice_a_day(db):
    admin = await make_user(db, "superadmin", superuser=True)
    await service.save_settings(db, SupportSettingsIO(auto_ack_enabled=True), admin)
    sent: list[str] = []

    async def sender(conv, text):
        sent.append(text)
        return True

    _, conv, created = await wa_in(db, phone="250788000001")
    assert created and await service.maybe_acknowledge(db, conv, automated=False, sender=sender)
    assert not await service.maybe_acknowledge(db, conv, automated=False, sender=sender)               # same conversation: once
    _, auto_conv, _ = await wa_in(db, phone="250788000002")
    assert not await service.maybe_acknowledge(db, auto_conv, automated=True, sender=sender)           # automated sender
    # a second NEW conversation from the same customer within 24h gets no second acknowledgement
    conv2 = SupportConversation(channel="whatsapp", external_thread_id="again", customer_phone="250788000001", status="open")
    db.add(conv2)
    await db.flush()
    assert not await service.maybe_acknowledge(db, conv2, automated=False, sender=sender)
    assert len(sent) == 1


def test_business_hours_and_default_always_open():
    open_always = SupportSettingsIO()
    assert service.within_business_hours(open_always)
    cfg = SupportSettingsIO(timezone="UTC", hours={d: {"open": "08:00", "close": "17:00"} for d in ("mon", "tue", "wed", "thu", "fri")})
    assert service.within_business_hours(cfg, datetime(2026, 10, 19, 9, 0, tzinfo=UTC))        # Monday 09:00
    assert not service.within_business_hours(cfg, datetime(2026, 10, 19, 18, 0, tzinfo=UTC))   # after hours
    assert not service.within_business_hours(cfg, datetime(2026, 10, 18, 10, 0, tzinfo=UTC))   # Sunday


# ── tickets, permissions, tenant isolation ────────────────────────────────────────────────────────────────────

async def test_converting_a_conversation_to_a_ticket_is_idempotent(db):
    agent = await make_user(db)
    _, conv, _ = await wa_in(db)
    t1, created1 = await service.create_ticket_from_conversation(db, agent, conv)
    t2, created2 = await service.create_ticket_from_conversation(db, agent, conv)
    assert created1 and not created2 and t1.id == t2.id and t1.reference.startswith("PES-")


async def test_agents_only_see_unassigned_or_their_own_conversations(db):
    a, b, boss = await make_user(db), await make_user(db), await make_user(db, "support_manager")
    _, conv, _ = await wa_in(db)
    await service.assign(db, boss, conv, a.id)
    assert (await service.get_conversation(db, a, conv.id)).id == conv.id
    with pytest.raises(ForbiddenError):
        await service.get_conversation(db, b, conv.id)
    assert (await service.get_conversation(db, boss, conv.id)).id == conv.id
    with pytest.raises(ForbiddenError):
        await service.assign(db, b, conv, b.id)                                                  # can't take someone else's
    with pytest.raises(ForbiddenError):
        await service.assign(db, a, conv, b.id)                                                  # agents can't assign others
    rows, _ = await service.list_conversations(db, b, view="all")
    assert conv.id not in [r.id for r in rows]


async def test_only_platform_staff_pass_the_staff_gate_never_a_business_user(db):
    t = await make_tenant(db)
    owner = await make_user(db, "owner", tenant=t, superuser=True)           # tenant owners are is_superuser inside their tenant
    fake_superadmin = await make_user(db, "superadmin", tenant=t, superuser=True)
    plain = await make_user(db, "member")                                    # platform user without a support role
    for u in (owner, fake_superadmin, plain):
        with pytest.raises(ForbiddenError):
            await get_support_staff(u)
    agent = await make_user(db)
    assert (await get_support_staff(agent)).id == agent.id
    with pytest.raises(ForbiddenError):
        await require_manager(agent)


async def test_a_business_only_ever_sees_its_own_tickets(db):
    ta, tb = await make_tenant(db), await make_tenant(db)
    ua, ub = await make_user(db, "member", tenant=ta), await make_user(db, "member", tenant=tb)
    ticket_a = await service.create_ticket(db, subject="A's problem", description="help", priority="normal", tenant_id=ta.id, requester=ua, creator=ua, from_portal=True)
    ticket_b = await service.create_ticket(db, subject="B's problem", description="help", priority="normal", tenant_id=tb.id, requester=ub, creator=ub, from_portal=True)
    mine_a, total_a = await service.my_tickets(db, ua, 1, 50)
    assert [t.id for t in mine_a] == [ticket_a.id] and total_a == 1
    with pytest.raises(NotFoundError):
        await service.get_my_ticket(db, ua, ticket_b.id)                                         # 404, not a leak
    with pytest.raises(NotFoundError):
        await service.get_my_ticket(db, await make_user(db, "member"), ticket_a.id)              # tenant-less user


async def test_tenant_http_isolation_and_staff_endpoints_reject_business_users(db):
    ta, tb = await make_tenant(db), await make_tenant(db)
    ua, ub = await make_user(db, "member", tenant=ta), await make_user(db, "member", tenant=tb)
    tb_ticket = await service.create_ticket(db, subject="Secret B", description="private", priority="normal", tenant_id=tb.id, requester=ub, creator=ub, from_portal=True)
    async with await _client(db, ua) as c:
        assert (await c.get(f"/api/v1/support/my/tickets/{tb_ticket.id}")).status_code == 404
        assert (await c.get("/api/v1/support/conversations")).status_code == 403
        assert (await c.get("/api/v1/support/tickets")).status_code == 403
        assert (await c.get("/api/v1/support/team")).status_code == 403
        created = await c.post("/api/v1/support/my/tickets", json={"subject": "Printer", "description": "It jams"})
        assert created.status_code == 201
        mine = (await c.get("/api/v1/support/my/tickets")).json()["data"]["items"]
        assert [t["subject"] for t in mine] == ["Printer"]


async def test_staff_reply_on_a_portal_ticket_is_visible_to_the_business_but_notes_are_not(db):
    t = await make_tenant(db)
    user = await make_user(db, "member", tenant=t)
    agent = await make_user(db)
    ticket = await service.create_ticket(db, subject="Reports empty", description="Nothing shows", priority="high", tenant_id=t.id, requester=user, creator=user, from_portal=True)
    conv = await db.get(SupportConversation, ticket.conversation_id)
    await service.add_note(db, agent, conv, "Looks like a filter problem — internal only")
    reply = await messaging.send_reply(db, agent, conv, "Please clear the date filter", [])
    assert reply.delivery_status == "delivered" and conv.assigned_to == agent.id
    visible, _ = await service.list_messages(db, conv.id, include_internal=False)
    assert [m.body for m in visible] == ["Nothing shows", "Please clear the date filter"]


async def test_failed_whatsapp_send_is_recorded_not_raised(db, monkeypatch):
    monkeypatch.setattr(settings, "OPENWA_BASE_URL", "")
    agent = await make_user(db)
    _, conv, _ = await wa_in(db)
    msg = await messaging.send_reply(db, agent, conv, "Hello back", [])
    assert msg.delivery_status == "failed" and msg.delivery_error


async def test_only_super_admin_can_create_team_members_and_inactive_members_release_their_work(db):
    admin = await make_user(db, "superadmin", superuser=True)
    u, temp = await service.create_staff(db, admin, f"{uuid.uuid4().hex[:6]}@pesaa.test", "New Agent", "support_agent")
    assert u.tenant_id is None and u.role == "support_agent" and len(temp) >= 12
    with pytest.raises(ValidationError):
        await service.create_staff(db, admin, "x@pesaa.test", "X", "superadmin")
    _, conv, _ = await wa_in(db)
    await service.assign(db, admin, conv, u.id)
    await service.update_staff(db, admin, u.id, None, False)
    await db.refresh(conv)
    assert conv.assigned_to is None


async def test_retention_purges_only_old_resolved_conversations(db):
    admin = await make_user(db, "superadmin", superuser=True)
    await service.save_settings(db, SupportSettingsIO(retention_days=30), admin)
    _, old, _ = await wa_in(db, phone="250788000010")
    _, fresh, _ = await wa_in(db, phone="250788000011")
    _, still_open, _ = await wa_in(db, phone="250788000012")
    old.status, old.last_message_at = "resolved", datetime.now(UTC) - timedelta(days=90)
    fresh.status, fresh.last_message_at = "resolved", datetime.now(UTC) - timedelta(days=5)
    still_open.last_message_at = datetime.now(UTC) - timedelta(days=90)
    await db.flush()
    assert await service.purge_old_conversations(db) == 1
    remaining = {c.id for c in (await db.execute(select(SupportConversation))).scalars()}
    assert old.id not in remaining and fresh.id in remaining and still_open.id in remaining


# ── real-time hub scoping ─────────────────────────────────────────────────────────────────────────────────────

async def test_hub_scopes_events_like_the_inbox():
    from app.modules.support import hub
    agent_a, agent_b, boss = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    sa, sb, sm = hub.subscribe(agent_a, "support_agent"), hub.subscribe(agent_b, "support_agent"), hub.subscribe(boss, "support_manager")
    try:
        hub.publish({"type": "x"}, assigned_to=agent_a)
        assert not sa.queue.empty() and sb.queue.empty() and not sm.queue.empty()       # B isn't told about A's conversation
        hub.publish({"type": "unassigned"}, assigned_to=None)
        assert sb.queue.qsize() == 1 and sa.queue.qsize() == 2
        hub.publish({"type": "direct"}, only_user=agent_b)
        assert sb.queue.qsize() == 2 and sa.queue.qsize() == 2
    finally:
        for s in (sa, sb, sm):
            hub.unsubscribe(s)


# ── Email outbox: idempotency, delivery truth, retries ───────────────────────────────────────────────────────

async def email_conv(db, sender="cust@example.com", subject="Invoice question", mid=None):
    m = email_inbound.EmailIn(message_id=mid or f"<{uuid.uuid4().hex}@example.com>", sender_email=sender, sender_name="Cust", subject=subject, body="Hi there")
    _, conv = await email_inbound.ingest_email(db, m)
    return conv


@pytest.fixture
def smtp(monkeypatch):
    """Fake the SMTP transport: records what would be sent and lets a test choose the outcome."""
    from app.core.email import EmailDeliveryError

    state = {"sent": [], "error": None}
    monkeypatch.setattr(settings, "SUPPORT_SMTP_USER", "support@pesaa.test")
    monkeypatch.setattr(settings, "SUPPORT_SMTP_PASSWORD", "x")

    async def fake(to, subject, html, text=None, **kw):
        if state["error"]:
            raise state["error"]
        state["sent"].append({"to": to, "subject": subject, **kw})
        return kw["message_id"]

    monkeypatch.setattr(email_inbound, "send_email_message", fake)
    state["Error"] = EmailDeliveryError
    return state


async def test_email_reply_is_sent_with_thread_headers_and_marked_sent_only_after_acceptance(db, smtp):
    agent = await make_user(db)
    conv = await email_conv(db, mid="<c1@example.com>")
    msg = await messaging.send_reply(db, agent, conv, "Sorted, thanks", [])
    assert msg.delivery_status == "sent" and msg.provider_message_id.startswith("<")
    sent = smtp["sent"][0]
    assert sent["subject"] == "Re: Invoice question" and sent["headers"]["In-Reply-To"] == "<c1@example.com>"
    assert sent["message_id"] == msg.provider_message_id
    # the customer's reply to OUR Message-ID lands in the same conversation
    reply = email_inbound.EmailIn(message_id="<c2@example.com>", sender_email="cust@example.com", sender_name="Cust", subject="Re: Invoice question",
                                  body="Great", in_reply_to=msg.provider_message_id)
    _, again = await email_inbound.ingest_email(db, reply)
    assert again.id == conv.id


async def test_repeated_send_with_the_same_client_request_id_sends_one_email(db, smtp):
    agent = await make_user(db)
    conv = await email_conv(db)
    rid = uuid.uuid4()
    first = await messaging.send_reply(db, agent, conv, "Once", [], rid)
    second = await messaging.send_reply(db, agent, conv, "Once", [], rid)
    assert first.id == second.id and len(smtp["sent"]) == 1
    count = (await db.execute(select(func.count()).select_from(SupportMessage).where(SupportMessage.conversation_id == conv.id, SupportMessage.direction == "outgoing"))).scalar_one()
    assert count == 1


async def test_temporary_smtp_failure_stays_pending_then_the_worker_delivers_it(db, smtp):
    agent = await make_user(db)
    conv = await email_conv(db)
    smtp["error"] = smtp["Error"](retryable=True)
    msg = await messaging.send_reply(db, agent, conv, "Retry me", [])
    assert msg.delivery_status == "pending" and msg.send_attempts == 1 and msg.next_attempt_at > datetime.now(UTC)
    smtp["error"] = None
    msg.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
    msg.send_started_at = None
    await db.flush()
    assert await email_inbound.dispatch_due(db) >= 1
    await db.refresh(msg)
    assert msg.delivery_status == "sent" and len(smtp["sent"]) == 1


async def test_permanent_and_uncertain_failures_are_failed_and_never_auto_retried(db, smtp):
    agent = await make_user(db)
    conv = await email_conv(db)
    smtp["error"] = smtp["Error"](retryable=False)
    bad = await messaging.send_reply(db, agent, conv, "Rejected", [])
    assert bad.delivery_status == "failed" and bad.next_attempt_at is None
    smtp["error"] = smtp["Error"](uncertain=True)
    unsure = await messaging.send_reply(db, agent, conv, "Unsure", [])
    assert unsure.delivery_status == "failed" and "Sent Items" in unsure.delivery_error
    smtp["error"] = None
    assert await email_inbound.dispatch_due(db) == 0  # neither is picked up again


async def test_retry_of_a_failed_email_reuses_the_message_id(db, smtp):
    agent = await make_user(db)
    conv = await email_conv(db)
    smtp["error"] = smtp["Error"](retryable=False)
    failed = await messaging.send_reply(db, agent, conv, "Try again", [])
    smtp["error"] = None
    again = await messaging.retry_failed(db, agent, conv, failed)
    assert again.id == failed.id and again.delivery_status == "sent"


async def test_email_send_needs_a_configured_mailbox_and_a_customer_address(db, monkeypatch):
    monkeypatch.setattr(settings, "SUPPORT_SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    agent = await make_user(db)
    conv = await email_conv(db)
    with pytest.raises(ValidationError):
        await messaging.send_reply(db, agent, conv, "No mailbox", [])


async def test_search_finds_conversations_by_message_content_but_not_internal_notes(db):
    agent = await make_user(db, role="support_manager")
    conv = await email_conv(db, subject="Hello")
    await service.add_note(db, agent, conv, "zebra-secret-note")
    rows, _ = await service.list_conversations(db, agent, channel="email", search="Hi there")
    assert conv.id in {r.id for r in rows}
    rows, _ = await service.list_conversations(db, agent, channel="email", search="zebra-secret-note")
    assert conv.id not in {r.id for r in rows}


async def test_email_test_endpoints_are_super_admin_only(db):
    agent = await make_user(db, role="support_agent")

    async def override():
        return agent

    app.dependency_overrides[get_current_user] = override
    app.dependency_overrides[get_db] = lambda: db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            assert (await c.post("/api/v1/support/channels/email/test-connection")).status_code == 403
            assert (await c.post("/api/v1/support/channels/email/test-send", json={})).status_code == 403
    finally:
        app.dependency_overrides.clear()


async def test_audience_lists_owner_email_and_phone_for_platform_staff_only(db):
    t = await make_tenant(db)
    t.phone, t.country = "+250788000111", "Rwanda"
    owner = await make_user(db, role="owner", tenant=t, email=f"owner-{uuid.uuid4().hex[:6]}@biz.test")
    member = await make_user(db, role="member", tenant=t)
    staff = await make_user(db, role="superadmin", superuser=True)
    biz_user = await make_user(db, role="member", tenant=t)

    async def call(user, path):
        async def override():
            return user
        app.dependency_overrides[get_current_user] = override
        app.dependency_overrides[get_db] = lambda: db
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
                return await c.get(path)
        finally:
            app.dependency_overrides.clear()

    res = await call(staff, f"/api/v1/admin/audience?q={owner.email}")
    assert res.status_code == 200
    items = res.json()["data"]["items"]
    assert [(i["name"], i["owner_email"], i["phone"]) for i in items] == [(t.name, owner.email, "+250788000111")]
    assert member.email not in str(items)
    assert (await call(biz_user, "/api/v1/admin/audience")).status_code == 403
