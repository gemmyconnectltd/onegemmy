"""Email problems: mail Pesaa sent that never reached the person, so a platform admin can follow it up.

Two ways a problem is found:
1. While sending: the mail server refused it (app.core.email calls `record_send_failure`).
2. Afterwards: the mail was accepted, then bounced. The bounce notice ("Mail Delivery Subsystem: Address not found") lands in
   the mailbox Pesaa sends from. `sync_bounces` reads those mailboxes over IMAP, read-only (EXAMINE + BODY.PEEK: nothing is
   marked read, moved or deleted), and records one problem per notice. The notice's Message-ID makes re-reading harmless.

Each problem is matched to the Pesaa user with that email (and so to their business) so the admin can see who it was for,
call them, correct the address and resend what was safe to resend."""
import asyncio
import imaplib
import re
import ssl
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email import message_from_bytes, message_from_string, policy
from email.message import Message
from email.utils import parseaddr, parsedate_to_datetime

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.modules.admin.models import EmailProblem
from app.modules.tenants.models import Tenant, User

log = get_logger("admin.email_problems")

REASONS = ("no_such_address", "domain_not_found", "mailbox_full", "blocked", "not_sent", "other")
# What was sent, recognised from the subject when only a bounce tells us (send failures pass `kind` directly).
_KIND_BY_SUBJECT: tuple[tuple[str, str], ...] = (
    (r"^Your Pesaa account is approved", "account_approved"),
    (r"^We've received your Pesaa registration", "registration_received"),
    (r"^Welcome to Pesaa", "welcome"),
    (r"^Reset your Pesaa password", "password_reset"),
    (r"^You've been invited to .+ on Pesaa", "invite"),
    (r"^Your .+ password was reset", "temp_password"),
    (r"^New signup pending approval", "pending_signup"),
)
_BOUNCE_SENDERS = ("mailer-daemon", "postmaster")
_BOUNCE_SUBJECT = re.compile(r"(?i)undeliver|delivery status notification|failure notice|returned mail|delivery has failed|address not found|mail delivery failed")
_EMAIL = re.compile(r"[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_STATUS = re.compile(r"\b([245])\.(\d{1,3})\.(\d{1,3})\b")
_TIMEOUT = 25
_BATCH = 100

# Per process: how far each mailbox has been read, and how the last check went (shown on the page).
_cursors: dict[str, tuple[str, int]] = {}
_last_check: dict = {"at": None, "error": None, "mailboxes": 0}


def kind_from_subject(subject: str | None) -> str | None:
    for pattern, kind in _KIND_BY_SUBJECT:
        if subject and re.search(pattern, subject):
            return kind
    return None


def classify(status: str | None, words: str | None) -> str:
    """The mail server's status code (5.1.1) and words → one reason a person understands."""
    text = (words or "").lower()
    if status in ("5.1.2", "5.4.4", "4.4.4", "5.1.10") and re.search(r"dns|domain|mx|host", text) or re.search(r"dns error|nxdomain|null mx|domain name not found|domain .{0,40}(not found|couldn't be found|does not exist|doesn't receive|does not accept)", text):
        return "domain_not_found"
    if status in ("5.1.1", "5.1.0", "5.1.10", "5.1.6") or re.search(r"does not exist|no such user|user unknown|unknown user|recipient not found|address not found|invalid recipient|mailbox unavailable", text):
        return "no_such_address"
    if status in ("5.1.2", "5.4.4", "4.4.4") or re.search(r"domain not found|host not found|nxdomain|no mx|unrouteable", text):
        return "domain_not_found"
    if status in ("5.2.2", "4.2.2") or re.search(r"mailbox (is )?full|over quota|quota exceeded|insufficient storage", text):
        return "mailbox_full"
    if (status or "").startswith("5.7") or re.search(r"blocked|spam|policy|rejected for policy|blacklist|not authorized", text):
        return "blocked"
    return "other"


# ── Recording ─────────────────────────────────────────────────────────────────

async def _owner_of_address(db: AsyncSession, address: str) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    row = (await db.execute(select(User.id, User.tenant_id).where(func.lower(User.email) == address.lower()).limit(1))).first()
    return (row[0], row[1]) if row else (None, None)


_TEST_DOMAINS = re.compile(r"(?i)@(.+\.)?(test|invalid|localhost|local|example)$|@(.+\.)?example\.(com|org|net)$")


def is_test_address(address: str) -> bool:
    """Seed and test data (…@example.com, …@pesaa.test): there is nobody to follow up, so it's never listed."""
    return bool(_TEST_DOMAINS.search(address.strip()))


async def record(db: AsyncSession, *, recipient: str, subject: str | None, kind: str | None, source: str, reason: str,
                 detail: str | None, smtp_code: str | None, occurred_at: datetime, source_ref: str | None = None) -> bool:
    """Adds one problem (no-op when this bounce notice is already recorded). Returns whether it was new. Does not commit."""
    recipient = recipient.strip().lower()[:255]
    if is_test_address(recipient):
        return False
    user_id, tenant_id = await _owner_of_address(db, recipient)
    stmt = insert(EmailProblem).values(
        id=uuid.uuid4(), recipient=recipient, subject=(subject or None) and subject[:300], kind=kind or kind_from_subject(subject),
        source=source, reason=reason if reason in REASONS else "other", detail=(detail or None) and detail[:2000],
        smtp_code=(smtp_code or None) and str(smtp_code)[:20], source_ref=source_ref and source_ref[:300],
        tenant_id=tenant_id, user_id=user_id, occurred_at=occurred_at, status="open",
    )
    if source_ref:
        stmt = stmt.on_conflict_do_nothing(index_elements=["source_ref"])
    return bool((await db.execute(stmt)).rowcount)


async def record_send_failure(*, to: str, subject: str, kind: str | None, error: Exception) -> None:
    """Called by app.core.email when a send fails. Uses its own session so the caller's transaction is untouched."""
    code = getattr(error, "smtp_code", None)
    words = getattr(error, "detail", None)
    status = (_STATUS.search(words or "") or [None])[0] if words else None
    reason = classify(status, words) if getattr(error, "rejected", False) else "not_sent"
    if reason == "other" and getattr(error, "rejected", False):
        reason = "no_such_address"  # the server refused this recipient permanently; it named no better reason
    if not words:
        words = "Pesaa could not hand this email to the mail server (it was down, timed out or refused the sign-in)."
    async with AsyncSessionLocal() as db:
        await record(db, recipient=to, subject=subject, kind=kind, source="send", reason=reason, detail=words,
                     smtp_code=str(code) if code else status, occurred_at=datetime.now(UTC))
        await db.commit()


# ── Reading bounce notices ────────────────────────────────────────────────────

@dataclass
class Bounce:
    ref: str
    recipient: str
    subject: str | None  # the subject of the mail that bounced
    status: str | None
    detail: str | None
    occurred_at: datetime


def _unfold(text: str) -> str:
    return re.sub(r"\r?\n[ \t]+", " ", text)


def _field(block: str, name: str) -> str | None:
    m = re.search(rf"(?im)^{name}:\s*(.+)$", block)
    return m.group(1).strip() if m else None


def _header_block(part: Message) -> Message | None:
    """The bounced mail's own headers, from a message/rfc822 or text/rfc822-headers part."""
    if part.get_content_type() == "message/rfc822":
        payload = part.get_payload()
        return payload[0] if isinstance(payload, list) and payload else None
    if part.get_content_type() == "text/rfc822-headers":
        raw = part.get_payload(decode=True) or b""
        return message_from_string(raw.decode("utf-8", "replace"), policy=policy.default)
    return None


def _plain(msg: Message) -> str:
    out = []
    for part in msg.walk():
        if part.get_content_type() in ("text/plain", "text/html") and not part.get_filename():
            raw = part.get_payload(decode=True) or b""
            out.append(re.sub(r"<[^>]+>", " ", raw.decode(part.get_content_charset() or "utf-8", "replace")))
    return " ".join(out)


def parse_bounce(raw: bytes, own_addresses: set[str] = frozenset()) -> Bounce | None:  # type: ignore[assignment]
    """A bounce notice → who it was for, why, and what bounced. None for anything that isn't a hard bounce (normal mail,
    "delayed, still trying" notices)."""
    msg = message_from_bytes(raw, policy=policy.compat32)
    sender = parseaddr(str(msg.get("From", "")))[1].lower()
    subject = str(msg.get("Subject", ""))
    if sender.split("@")[0] not in _BOUNCE_SENDERS and not _BOUNCE_SUBJECT.search(subject):
        return None
    if re.search(r"(?i)delay|will retry|still trying", subject):
        return None

    recipient = status = detail = original_subject = None
    for part in msg.walk():
        ctype = part.get_content_type()
        if ctype == "message/delivery-status":
            payload = part.get_payload()
            text = "\n\n".join(p.as_string() for p in payload) if isinstance(payload, list) else str(payload)
            text = _unfold(text)
            action = (_field(text, "Action") or "failed").lower()
            if action.startswith("delayed"):
                return None
            final = _field(text, "Final-Recipient") or _field(text, "Original-Recipient")
            if final:
                recipient = (_EMAIL.search(final) or [None])[0]
            status = _field(text, "Status")
            detail = _field(text, "Diagnostic-Code")
            if detail:
                detail = re.sub(r"(?i)^smtp;\s*", "", detail)
        elif ctype in ("message/rfc822", "text/rfc822-headers"):
            headers = _header_block(part)
            if headers is not None:
                original_subject = original_subject or (str(headers.get("Subject", "")).strip() or None)
                if not recipient:
                    recipient = (_EMAIL.search(str(headers.get("To", ""))) or [None])[0]

    body = _unfold(_plain(msg))
    if not recipient and msg.get("X-Failed-Recipients"):
        recipient = (_EMAIL.search(str(msg.get("X-Failed-Recipients"))) or [None])[0]
    if not recipient:  # last resort: the first address in the notice that isn't ours or the mail system's
        recipient = next((a for a in _EMAIL.findall(body) if a.lower() not in own_addresses and a.split("@")[0].lower() not in _BOUNCE_SENDERS), None)
    if not recipient:
        return None
    if not detail:
        m = re.search(r"\b[45]\d\d[ -][245]\.\d{1,3}\.\d{1,3}\b[^\n]{0,300}", body)
        detail = re.sub(r"\s+", " ", m.group(0)).strip() if m else None
    if not status and detail:
        s = _STATUS.search(detail)
        status = s.group(0) if s else None
    if status and status.startswith("4"):
        return None  # temporary: the server keeps trying, a later notice says whether it finally failed
    if not original_subject:
        m = re.search(r"(?im)^Subject:\s*(.+)$", body)
        original_subject = m.group(1).strip() if m else None

    try:
        when = parsedate_to_datetime(str(msg.get("Date"))) if msg.get("Date") else datetime.now(UTC)
        when = when if when.tzinfo else when.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        when = datetime.now(UTC)
    ref = str(msg.get("Message-ID", "")).strip() or f"<bounce-{recipient}-{when.isoformat()}>"
    return Bounce(ref=ref, recipient=recipient.lower(), subject=original_subject, status=status, detail=detail, occurred_at=when)


def _mailboxes() -> list[tuple[str, str]]:
    """Every distinct (user, password) Pesaa sends from, marketing excluded (it tracks its own bounces)."""
    from app.core.email import _resolve_smtp_credentials

    seen: dict[str, str] = {}
    for sender in ("accounts", "admin", "support"):
        user, password, _ = _resolve_smtp_credentials(sender)
        if user and password and user.lower() not in seen:
            seen[user.lower()] = password
    return list(seen.items())


def imap_host() -> str:
    if settings.EMAIL_BOUNCE_IMAP_HOST:
        return settings.EMAIL_BOUNCE_IMAP_HOST
    host = settings.SMTP_HOST or ""
    return "imap." + host[5:] if host.startswith("smtp.") else host


def enabled() -> bool:
    return settings.EMAIL_BOUNCE_SYNC and bool(imap_host()) and bool(_mailboxes())


def _fetch(user: str, password: str) -> list[bytes]:
    """Blocking: new bounce notices in one mailbox's inbox since the last read. Run in a worker thread."""
    since = (datetime.now(UTC) - timedelta(days=settings.EMAIL_BOUNCE_LOOKBACK_DAYS)).strftime("%d-%b-%Y")
    conn = imaplib.IMAP4_SSL(imap_host(), settings.EMAIL_BOUNCE_IMAP_PORT, ssl_context=ssl.create_default_context(), timeout=_TIMEOUT)
    try:
        conn.login(user, password)
        if conn.select("INBOX", readonly=True)[0] != "OK":
            return []
        _, data = conn.response("UIDVALIDITY")
        validity = data[0].decode() if data and data[0] else "0"
        typ, found = conn.uid("SEARCH", None, "SINCE", since, "OR", "FROM", "mailer-daemon", "FROM", "postmaster")
        if typ != "OK":
            return []
        last_validity, last_uid = _cursors.get(user, (validity, 0))
        floor = last_uid if last_validity == validity else 0
        uids = sorted(int(u) for u in (found[0] or b"").split() if int(u) > floor)[:_BATCH]
        out = []
        for uid in uids:
            typ, parts = conn.uid("FETCH", str(uid), "(BODY.PEEK[])")
            raw = next((x[1] for x in (parts or []) if isinstance(x, tuple)), None)
            if typ == "OK" and raw:
                out.append(raw)
        if uids:
            _cursors[user] = (validity, uids[-1])
        return out
    finally:
        try:
            conn.logout()
        except (imaplib.IMAP4.error, OSError):
            pass


async def _save(raws: list[bytes], own: set[str]) -> int:
    bounces = []
    for raw in raws:
        try:
            b = parse_bounce(raw, own)
        except Exception:  # noqa: BLE001 - one odd message must never stop the rest
            log.warning("email_problems.unreadable_notice")
            continue
        if b:
            bounces.append(b)
    if not bounces:
        return 0
    added = 0
    async with AsyncSessionLocal() as db:
        for b in bounces:
            added += await record(db, recipient=b.recipient, subject=b.subject, kind=None, source="bounce",
                                  reason=classify(b.status, b.detail), detail=b.detail, smtp_code=b.status,
                                  occurred_at=b.occurred_at, source_ref=b.ref)
        await db.commit()
    return added


async def sync_bounces() -> int:
    """Reads every sending mailbox once. Returns how many new problems were recorded."""
    boxes = _mailboxes()
    own = {u for u, _ in boxes}
    added, errors = 0, []
    for user, password in boxes:
        for _ in range(20):  # catch up on a backlog in one check, a batch at a time; each batch is saved before the next
            try:
                raws = await asyncio.to_thread(_fetch, user, password)
            except imaplib.IMAP4.error:
                errors.append(f"{user}: the mail server refused the sign-in for reading mail (is IMAP switched on for this mailbox?)")
                break
            except (OSError, TimeoutError, ssl.SSLError) as e:
                errors.append(f"{user}: couldn't reach {imap_host()} ({type(e).__name__})")
                break
            added += await _save(raws, own)
            if len(raws) < _BATCH:
                break
    _last_check.update(at=datetime.now(UTC), error="; ".join(errors) or None, mailboxes=len(boxes))
    if added:
        log.info("email_problems.bounces_recorded", extra={"_extra_fields": {"count": added}})
    return added


async def run_forever() -> None:
    while True:
        try:
            await sync_bounces()
        except Exception:
            log.exception("email_problems.sync_error")
        await asyncio.sleep(max(60, settings.EMAIL_BOUNCE_INTERVAL_SECONDS))


def start() -> asyncio.Task | None:
    return asyncio.create_task(run_forever()) if enabled() else None


def check_status() -> dict:
    return {"enabled": enabled(), "host": imap_host() or None, "last_checked_at": _last_check["at"].isoformat() if _last_check["at"] else None,
            "last_error": _last_check["error"], "mailboxes": _last_check["mailboxes"]}


# ── Listing ───────────────────────────────────────────────────────────────────

def _search(stmt, q: str | None):
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(EmailProblem.recipient).like(like), func.lower(func.coalesce(EmailProblem.subject, "")).like(like),
                              func.lower(func.coalesce(Tenant.name, "")).like(like), func.lower(func.coalesce(User.full_name, "")).like(like)))
    return stmt


async def list_problems(db: AsyncSession, *, status: str, reason: str | None, q: str | None, page: int, page_size: int) -> tuple[list[dict], int]:
    base = (select(EmailProblem, User, Tenant).outerjoin(User, User.id == EmailProblem.user_id)
            .outerjoin(Tenant, Tenant.id == EmailProblem.tenant_id))
    if status != "all":
        base = base.where(EmailProblem.status == status)
    if reason:
        base = base.where(EmailProblem.reason == reason)
    base = _search(base, q)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(EmailProblem.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    return [serialize(p, u, t) for p, u, t in rows], total


RESENDABLE = {"account_approved", "registration_received", "welcome"}


def serialize(p: EmailProblem, u: User | None, t: Tenant | None) -> dict:
    return {
        "id": str(p.id), "recipient": p.recipient, "subject": p.subject, "kind": p.kind, "source": p.source, "reason": p.reason,
        "detail": p.detail, "smtp_code": p.smtp_code, "occurred_at": p.occurred_at.isoformat(), "status": p.status,
        "resolved_at": p.resolved_at.isoformat() if p.resolved_at else None, "resolution": p.resolution,
        "can_resend": p.kind in RESENDABLE and u is not None,
        "user": {"id": str(u.id), "full_name": u.full_name, "email": u.email, "phone": u.phone, "role": u.role} if u else None,
        "tenant": {"id": str(t.id), "name": t.name, "phone": t.phone, "email": t.email, "is_active": t.is_active,
                   "subscription_status": t.subscription_status} if t else None,
    }


async def summary(db: AsyncSession) -> dict:
    rows = (await db.execute(select(EmailProblem.reason, func.count()).where(EmailProblem.status == "open").group_by(EmailProblem.reason))).all()
    by_reason = {r: n for r, n in rows}
    week = datetime.now(UTC) - timedelta(days=7)
    resolved_week = (await db.execute(select(func.count()).where(EmailProblem.status == "resolved", EmailProblem.resolved_at >= week))).scalar_one()
    return {"open": sum(by_reason.values()), "by_reason": by_reason, "resolved_last_7_days": resolved_week, "check": check_status()}


async def load(db: AsyncSession, problem_id: uuid.UUID) -> tuple[EmailProblem, User | None, Tenant | None] | None:
    row = (await db.execute(select(EmailProblem, User, Tenant).outerjoin(User, User.id == EmailProblem.user_id)
                            .outerjoin(Tenant, Tenant.id == EmailProblem.tenant_id).where(EmailProblem.id == problem_id))).first()
    return (row[0], row[1], row[2]) if row else None


async def resend(db: AsyncSession, problem: EmailProblem, user: User, tenant: Tenant | None, to: str) -> bool:
    """Sends again what bounced, rebuilt from today's records (never a stored copy). Only mails without secrets in them."""
    from app.core import email as mail

    name, business = user.full_name, tenant.name if tenant else "your business"
    if problem.kind == "account_approved":
        return await mail.send_account_approved_email(to=to, full_name=name, tenant_name=business,
                                                      dashboard_url=f"{settings.FRONTEND_URL}/dashboard", sender="admin")
    if problem.kind == "registration_received":
        return await mail.send_registration_received_email(to=to, full_name=name, tenant_name=business)
    if problem.kind == "welcome":
        return await mail.send_welcome_email(to=to, full_name=name, tenant_name=business, tenant_slug=tenant.slug if tenant else "",
                                             dashboard_url=f"{settings.FRONTEND_URL}/dashboard")
    return False


async def close_others(db: AsyncSession, recipient: str, admin_id: uuid.UUID, resolution: str, keep: uuid.UUID) -> int:
    """Other open problems for the same address are settled by the same follow-up."""
    rows = (await db.execute(select(EmailProblem).where(EmailProblem.recipient == recipient, EmailProblem.status == "open", EmailProblem.id != keep))).scalars().all()
    for r in rows:
        r.status, r.resolved_at, r.resolved_by, r.resolution = "resolved", datetime.now(UTC), admin_id, resolution
    return len(rows)
