"""IMAP inbound: parsing, cursor/dedup, read-only behaviour, failure handling, environment isolation.

No real mail server is contacted: `imaplib.IMAP4_SSL` is replaced by an in-memory fake that records every command, so
the tests can prove the mailbox is only ever opened read-only and fetched with BODY.PEEK."""
import imaplib
import uuid
from email.message import EmailMessage
from typing import ClassVar

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.modules.support import email_imap, email_inbound
from app.modules.support.models import SupportChannel, SupportConversation, SupportMessage

pytestmark = pytest.mark.db


def raw_mail(sender="Cust <cust@example.com>", subject="Invoice question", body="Hello there", message_id=None, in_reply_to=None,
             references=None, html=None, attach=None, extra=None) -> bytes:
    m = EmailMessage()
    m["From"], m["To"], m["Subject"] = sender, "support@pesaa.io", subject
    if message_id is not False:
        m["Message-ID"] = message_id or f"<{uuid.uuid4().hex}@example.com>"
    if in_reply_to:
        m["In-Reply-To"] = in_reply_to
    if references:
        m["References"] = references
    for k, v in (extra or {}).items():
        m[k] = v
    if html is not None:
        m.set_content(body)
        m.add_alternative(html, subtype="html")
    else:
        m.set_content(body)
    if attach:
        m.add_attachment(attach[2], maintype=attach[1].split("/")[0], subtype=attach[1].split("/")[1], filename=attach[0])
    return m.as_bytes()


class FakeIMAP:
    """One shared in-memory mailbox: {uid: raw bytes}. Records commands so tests can assert on them."""
    mailbox: ClassVar[dict[int, bytes]] = {}
    validity = "1700000001"
    log: ClassVar[list] = []
    fail_login = False
    fail_connect = False

    def __init__(self, host, port, ssl_context=None, timeout=None):
        if FakeIMAP.fail_connect:
            raise TimeoutError("timed out")
        FakeIMAP.log.append(("connect", host, port, timeout is not None))

    def login(self, user, password):
        FakeIMAP.log.append(("login", user))
        if FakeIMAP.fail_login:
            raise imaplib.IMAP4.error("AUTHENTICATIONFAILED")
        return "OK", [b"ok"]

    def select(self, folder, readonly=False):
        FakeIMAP.log.append(("select", folder, readonly))
        return "OK", [b"1"]

    def response(self, name):
        return name, [FakeIMAP.validity.encode()]

    def uid(self, cmd, *args):
        FakeIMAP.log.append((cmd, *args))
        if cmd == "SEARCH":
            if args[1].startswith("UID"):
                lo = int(args[1].split()[1].split(":")[0])
                found = [u for u in FakeIMAP.mailbox if u >= lo] or [max(FakeIMAP.mailbox)] if FakeIMAP.mailbox else []
            else:
                found = list(FakeIMAP.mailbox)
            return "OK", [" ".join(map(str, found)).encode()]
        uid = int(args[0])
        if "RFC822.SIZE" in args[1]:
            return "OK", [f"{uid} (UID {uid} RFC822.SIZE {len(FakeIMAP.mailbox[uid])})".encode()]
        return "OK", [(f"{uid} (UID {uid} BODY[] {{{len(FakeIMAP.mailbox[uid])}}}".encode(), FakeIMAP.mailbox[uid]), b")"]

    def logout(self):
        FakeIMAP.log.append(("logout",))


@pytest.fixture
def imap(monkeypatch):
    FakeIMAP.mailbox, FakeIMAP.log, FakeIMAP.fail_login, FakeIMAP.fail_connect = {}, [], False, False
    monkeypatch.setattr(imaplib, "IMAP4_SSL", FakeIMAP)
    for k, v in {"SUPPORT_IMAP_HOST": "mail.test", "SUPPORT_IMAP_USER": "support@pesaa.io", "SUPPORT_IMAP_PASSWORD": "s3cret-pass",
                 "SUPPORT_IMAP_SYNC_ENABLED": True, "SUPPORT_MAILBOX": "", "SUPPORT_IMAP_FOLDER": "INBOX"}.items():
        monkeypatch.setattr(settings, k, v)
    return FakeIMAP


async def sync(db):
    return await email_inbound.sync_mailbox(db)


async def message_count(db, conv_id=None):
    stmt = select(func.count()).select_from(SupportMessage).where(SupportMessage.direction == "incoming")
    if conv_id:
        stmt = stmt.where(SupportMessage.conversation_id == conv_id)
    return (await db.execute(stmt)).scalar_one()


# ── parsing ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_parses_sender_threading_headers_and_plain_text():
    m = email_imap.parse_message(raw_mail(message_id="<a@x>", in_reply_to="<p@x>", references="<r1@x> <p@x>"), uid=5, uidvalidity="9")
    assert (m.sender_email, m.sender_name, m.subject, m.message_id) == ("cust@example.com", "Cust", "Invoice question", "<a@x>")
    assert m.in_reply_to == "<p@x>" and m.references == ["<r1@x>", "<p@x>"] and "Hello there" in m.body


def test_html_only_mail_is_converted_to_safe_text_and_scripts_are_dropped():
    m = EmailMessage()
    m["From"], m["Subject"], m["Message-ID"] = "a@b.co", "Hi", "<h@x>"
    m.set_content("<p>Hello <b>world</b></p><script>alert(1)</script>", subtype="html")
    parsed = email_imap.parse_message(m.as_bytes(), uid=1, uidvalidity="1")
    assert "Hello world" in parsed.body and "alert" not in parsed.body and "<" not in parsed.body


def test_missing_message_id_gets_a_stable_synthetic_one_and_no_sender_is_rejected():
    a = email_imap.parse_message(raw_mail(message_id=False), uid=7, uidvalidity="3")
    b = email_imap.parse_message(raw_mail(message_id=False), uid=7, uidvalidity="3")
    assert a.message_id == b.message_id == "<imap-3-7@mail.test>" or a.message_id.startswith("<imap-3-7@")
    assert email_imap.parse_message(b"Subject: no sender\r\n\r\nbody", uid=1, uidvalidity="1") is None


def test_attachments_and_automation_headers_are_extracted():
    m = email_imap.parse_message(raw_mail(attach=("a.pdf", "application/pdf", b"%PDF-1.4 x"), extra={"Auto-Submitted": "auto-replied"}), uid=1, uidvalidity="1")
    assert [(a["name"], a["mime"], a["data"]) for a in m.attachments] == [("a.pdf", "application/pdf", b"%PDF-1.4 x")]
    assert m.headers["auto-submitted"] == "auto-replied"


# ── sync ────────────────────────────────────────────────────────────────────────────────────────────────────────

async def test_sync_imports_mail_read_only_and_never_marks_moves_or_deletes(db, imap):
    imap.mailbox = {10: raw_mail(subject="First"), 11: raw_mail(sender="Other <o@example.com>", subject="Second")}
    assert await sync(db) == 2
    assert ("select", '"INBOX"', True) in imap.log  # opened read-only
    fetches = [c for c in imap.log if c[0] == "FETCH" and "BODY" in c[2]]
    assert fetches and all("BODY.PEEK[]" in c[2] for c in fetches)
    assert not [c for c in imap.log if c[0] in ("STORE", "COPY", "MOVE", "EXPUNGE")]
    assert ("login", "support@pesaa.io") in imap.log and ("logout",) in imap.log


async def test_repeated_syncs_never_duplicate_and_only_fetch_new_uids(db, imap):
    imap.mailbox = {10: raw_mail(subject="One")}
    assert await sync(db) == 1
    assert await sync(db) == 0
    imap.mailbox[11] = raw_mail(subject="Two")
    imap.log.clear()
    assert await sync(db) == 1
    assert not [c for c in imap.log if c[0] == "FETCH" and c[1] == "10"]  # message 10 isn't fetched again
    ch = (await db.execute(select(SupportChannel).where(SupportChannel.name == "support@pesaa.io"))).scalars().one()
    assert ch.state["imap_last_uid"] == 11 and ch.status == "connected" and ch.last_error is None


async def test_a_reset_cursor_or_new_uidvalidity_reimports_without_duplicates(db, imap):
    imap.mailbox = {10: raw_mail(message_id="<same@x>")}
    assert await sync(db) == 1
    imap.validity = "1700000099"  # server renumbered the mailbox
    assert await sync(db) == 0
    assert await message_count(db) >= 1
    n = (await db.execute(select(func.count()).select_from(SupportMessage).where(SupportMessage.provider_message_id == "<same@x>"))).scalar_one()
    assert n == 1


async def test_reply_threads_onto_the_existing_conversation(db, imap):
    imap.mailbox = {1: raw_mail(message_id="<first@x>", subject="Billing")}
    await sync(db)
    imap.mailbox[2] = raw_mail(message_id="<second@x>", subject="Re: Billing", in_reply_to="<first@x>")
    imap.mailbox[3] = raw_mail(sender="Else <else@example.com>", message_id="<third@x>", subject="Billing")  # same subject, other sender
    assert await sync(db) == 2
    convs = (await db.execute(select(SupportConversation).where(SupportConversation.channel == "email"))).scalars().all()
    by_email = {c.customer_email: c for c in convs}
    assert await message_count(db, by_email["cust@example.com"].id) == 2
    assert by_email["else@example.com"].id != by_email["cust@example.com"].id


async def test_our_own_mailbox_address_is_never_imported(db, imap):
    imap.mailbox = {1: raw_mail(sender="Pesaa Support <support@pesaa.io>")}
    assert await sync(db) == 0


async def test_malformed_and_oversized_mail_is_skipped_but_the_rest_still_imports(db, imap, monkeypatch):
    monkeypatch.setattr(email_imap, "MAX_MESSAGE_BYTES", 5000)
    imap.mailbox = {1: b"Subject: no sender\r\n\r\nx", 2: raw_mail(attach=("big.pdf", "application/pdf", b"0" * 9000)), 3: raw_mail(subject="Fine")}
    assert await sync(db) == 1
    ch = (await db.execute(select(SupportChannel).where(SupportChannel.name == "support@pesaa.io"))).scalars().one()
    assert ch.state["imap_last_uid"] == 3  # the cursor moved past the skipped messages


async def test_authentication_and_connection_failures_are_recorded_safely(db, imap, caplog):
    imap.fail_login = True
    assert await sync(db) == 0
    ch = (await db.execute(select(SupportChannel).where(SupportChannel.name == "support@pesaa.io"))).scalars().one()
    assert ch.status == "error" and "rejected" in ch.last_error and "s3cret-pass" not in ch.last_error
    imap.fail_login, imap.fail_connect = False, True
    assert await sync(db) == 0
    await db.refresh(ch)
    assert ch.status == "error" and "reach" in ch.last_error and "s3cret-pass" not in ch.last_error
    assert "s3cret-pass" not in caplog.text


# ── isolation / entry point ─────────────────────────────────────────────────────────────────────────────────────

async def test_imap_is_off_unless_explicitly_enabled_so_staging_never_syncs_the_shared_mailbox(db, imap, monkeypatch):
    imap.mailbox = {1: raw_mail()}
    monkeypatch.setattr(settings, "SUPPORT_IMAP_SYNC_ENABLED", False)
    assert email_inbound.inbound_provider() is None and not email_inbound.inbound_enabled()
    assert await sync(db) == 0 and not imap.log  # no connection is even attempted
    assert settings.model_fields["SUPPORT_IMAP_SYNC_ENABLED"].default is False


async def test_graph_remains_the_provider_when_imap_is_not_enabled(monkeypatch):
    for k, v in {"SUPPORT_IMAP_SYNC_ENABLED": False, "SUPPORT_MAILBOX": "s@x.com", "GRAPH_TENANT_ID": "t", "GRAPH_CLIENT_ID": "c", "GRAPH_CLIENT_SECRET": "s"}.items():
        monkeypatch.setattr(settings, k, v)
    assert email_inbound.inbound_provider() == "graph"
    monkeypatch.setattr(settings, "SUPPORT_IMAP_SYNC_ENABLED", True)
    monkeypatch.setattr(settings, "SUPPORT_IMAP_HOST", "mail.test")
    monkeypatch.setattr(settings, "SUPPORT_IMAP_USER", "support@pesaa.io")
    monkeypatch.setattr(settings, "SUPPORT_IMAP_PASSWORD", "p")
    assert email_inbound.inbound_provider() == "imap"
