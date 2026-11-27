"""Email problems: bounce notices are read correctly, failures are listed for admins, and following up works."""
import json
import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.core.exceptions import ConflictError, ValidationError
from app.modules.admin import email_problems as problems
from app.modules.admin import email_problems_routes as routes
from app.modules.admin.models import EmailProblem
from app.modules.tenants.models import Tenant, User

GMAIL_BOUNCE = b"""Delivered-To: accounts@pesaa.io
Return-Path: <>
From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: accounts@pesaa.io
Subject: Delivery Status Notification (Failure)
Date: Thu, 26 Nov 2026 22:12:01 -0800 (PST)
Message-ID: <bounce-1@mx.google.com>
X-Failed-Recipients: jane.typo012@gmail.com
MIME-Version: 1.0
Content-Type: multipart/report; boundary="b1"; report-type=delivery-status

--b1
Content-Type: text/plain; charset="UTF-8"

** Address not found **

Your message wasn't delivered to jane.typo012@gmail.com because the address couldn't be found, or is unable to receive mail.

--b1
Content-Type: message/delivery-status

Reporting-MTA: dns; googlemail.com

Final-Recipient: rfc822; jane.typo012@gmail.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does
 not exist. Please try double-checking the recipient's email address.

--b1
Content-Type: message/rfc822

From: Pesaa <accounts@pesaa.io>
To: jane.typo012@gmail.com
Subject: Your Pesaa account is approved
Message-ID: <orig-1@pesaa.io>

Hi Jane Mugisha
--b1--
"""

DELAYED = GMAIL_BOUNCE.replace(b"Action: failed", b"Action: delayed").replace(b"Status: 5.1.1", b"Status: 4.4.1")


def test_reads_a_gmail_address_not_found_bounce():
    b = problems.parse_bounce(GMAIL_BOUNCE, {"accounts@pesaa.io"})
    assert b is not None
    assert b.recipient == "jane.typo012@gmail.com"
    assert b.subject == "Your Pesaa account is approved"
    assert b.status == "5.1.1" and "does not exist" in b.detail
    assert b.ref == "<bounce-1@mx.google.com>"
    assert problems.classify(b.status, b.detail) == "no_such_address"
    assert problems.kind_from_subject(b.subject) == "account_approved"


def test_ignores_delays_and_ordinary_mail():
    assert problems.parse_bounce(DELAYED) is None
    assert problems.parse_bounce(b"From: Jane <jane@example.com>\nSubject: Hello\n\nHi") is None


def test_reasons():
    assert problems.classify("5.2.2", None) == "mailbox_full"
    assert problems.classify(None, "Host not found") == "domain_not_found"
    assert problems.classify("5.7.1", "Message rejected for policy reasons") == "blocked"
    assert problems.classify(None, "something odd") == "other"
    assert problems.classify("5.1.10", "DNS Error: DNS type 'mx' lookup of example.com responded with code NOERROR") == "domain_not_found"
    assert problems.classify("5.1.1", "550 5.1.1 The email account that you tried to reach does not exist") == "no_such_address"


def test_test_addresses_are_never_listed():
    assert problems.is_test_address("zz@example.com") and problems.is_test_address("a@pesaa.test") and problems.is_test_address("x@shop.localhost")
    assert not problems.is_test_address("jane.typo012@gmail.com") and not problems.is_test_address("me@examples.rw")


async def _people(db):
    bad = f"wrong{uuid.uuid4().hex[:8]}@aguka.rw"
    tenant = Tenant(name="Aguka business Ltd", slug=uuid.uuid4().hex, currency="RWF", email=bad)
    db.add(tenant)
    await db.flush()
    owner = User(tenant_id=tenant.id, email=bad, full_name="Jane Mugisha", role="owner", phone="+250788000000", hashed_password="x")
    admin = User(email=f"{uuid.uuid4().hex}@pesaa.test", full_name="Admin One", role="superadmin", is_superuser=True, hashed_password="x")
    db.add_all([owner, admin])
    await db.flush()
    return tenant, owner, admin


def _body(resp) -> dict:
    return json.loads(resp.body)


@pytest.mark.db
async def test_bounce_is_listed_with_who_it_was_for_and_recorded_once(db):
    _, owner, _ = await _people(db)
    for _ in range(2):
        await problems.record(db, recipient=owner.email.upper(), subject="Your Pesaa account is approved", kind=None, source="bounce",
                              reason="no_such_address", detail="550 5.1.1 does not exist", smtp_code="5.1.1",
                              occurred_at=datetime.now(UTC), source_ref="<same-notice>")
    items, total = await problems.list_problems(db, status="open", reason=None, q="aguka", page=1, page_size=20)
    assert total == 1
    item = items[0]
    assert item["recipient"] == owner.email and item["kind"] == "account_approved" and item["can_resend"]
    assert item["user"]["full_name"] == "Jane Mugisha" and item["user"]["phone"] == "+250788000000"
    assert item["tenant"]["name"] == "Aguka business Ltd"
    assert (await problems.summary(db))["by_reason"]["no_such_address"] >= 1


@pytest.mark.db
async def test_correcting_the_email_changes_the_sign_in_resends_and_closes_the_problem(db, monkeypatch):
    tenant, owner, admin = await _people(db)
    await problems.record(db, recipient=owner.email, subject="Your Pesaa account is approved", kind="account_approved", source="bounce",
                          reason="no_such_address", detail=None, smtp_code=None, occurred_at=datetime.now(UTC), source_ref=f"<{uuid.uuid4()}>")
    await problems.record(db, recipient=owner.email, subject="Welcome to Pesaa", kind="welcome", source="bounce",
                          reason="no_such_address", detail=None, smtp_code=None, occurred_at=datetime.now(UTC), source_ref=f"<{uuid.uuid4()}>")
    sent = []

    async def fake_resend(db_, problem, user, tenant_, to):
        sent.append((problem.kind, to))
        return True

    monkeypatch.setattr(problems, "resend", fake_resend)
    bad = owner.email
    new = f"janemugisha{uuid.uuid4().hex[:8]}@aguka.rw"
    first = (await db.execute(select(EmailProblem).where(EmailProblem.kind == "account_approved", EmailProblem.recipient == owner.email))).scalar_one()

    with pytest.raises(ValidationError):
        await routes.correct_email(first.id, db, admin, routes.CorrectEmailRequest(email=bad))
    taken = f"taken{uuid.uuid4().hex[:8]}@aguka.rw"
    other = User(email=taken, full_name="Someone", hashed_password="x")
    db.add(other)
    await db.flush()
    with pytest.raises(ConflictError):
        await routes.correct_email(first.id, db, admin, routes.CorrectEmailRequest(email=taken))

    resp = _body(await routes.correct_email(first.id, db, admin, routes.CorrectEmailRequest(email=new)))
    assert resp["data"] == {"email": new, "resent": True}
    assert owner.email == new and tenant.email == new
    assert sent == [("account_approved", new)]
    left = (await db.execute(select(EmailProblem).where(EmailProblem.recipient == bad, EmailProblem.status == "open"))).all()
    assert left == []  # the welcome bounce to the same bad address is settled too


@pytest.mark.db
async def test_mark_followed_up_and_reopen(db):
    _, owner, admin = await _people(db)
    await problems.record(db, recipient=owner.email, subject="Reset your Pesaa password", kind=None, source="send",
                          reason="not_sent", detail=None, smtp_code=None, occurred_at=datetime.now(UTC))
    p = (await db.execute(select(EmailProblem).where(EmailProblem.recipient == owner.email))).scalar_one()
    assert p.kind == "password_reset"
    with pytest.raises(ValidationError):  # a reset link is never resent from a stored copy
        await routes.resend_same_address(p.id, db, admin)
    await routes.resolve(p.id, db, admin, routes.ResolveRequest(note="Called them; they reset it themselves"))
    assert p.status == "resolved" and p.resolution == "Called them; they reset it themselves" and p.resolved_by == admin.id
    await routes.reopen(p.id, db, admin)
    assert p.status == "open" and p.resolution is None


async def test_a_refused_send_is_put_on_the_list(monkeypatch):
    import smtplib

    from app.core import email as mail
    from app.core.config import settings

    class Refusing:
        def __init__(self, *a, **k): ...
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def ehlo(self): ...
        def starttls(self): ...
        def login(self, *a): ...
        def send_message(self, msg):
            raise smtplib.SMTPRecipientsRefused({msg["To"]: (550, b"5.1.1 The email account that you tried to reach does not exist")})

    noted = []

    async def fake_record(**kw):
        noted.append(kw)

    monkeypatch.setattr(settings, "SMTP_USER", "accounts@pesaa.io")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "app-password")
    monkeypatch.setattr(mail.smtplib, "SMTP", Refusing)
    monkeypatch.setattr(problems, "record_send_failure", fake_record)
    ok = await mail.send_account_approved_email(to="nobody@aguka.rw", full_name="John", tenant_name="Aguka", dashboard_url="https://app.pesaa.io")
    assert ok is False
    assert noted and noted[0]["to"] == "nobody@aguka.rw" and noted[0]["kind"] == "account_approved"
    err = noted[0]["error"]
    assert err.rejected and err.smtp_code == 550 and "does not exist" in err.detail
