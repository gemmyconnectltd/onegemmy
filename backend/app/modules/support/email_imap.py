"""Inbound support mail over IMAP (standard-library `imaplib`, TLS only).

Read-only by design: the folder is opened with EXAMINE and messages are fetched with BODY.PEEK, so nothing is
marked read, moved or deleted. All blocking network work runs in a worker thread (`asyncio.to_thread`), never on
the event loop. Progress is tracked as (UIDVALIDITY, last UID) in the channel state; repeated runs — and a
reset cursor — are safe because `ingest_email` deduplicates on Message-ID. Credentials are never logged."""
import asyncio
import imaplib
import re
import ssl
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email import message_from_bytes, policy
from email.message import EmailMessage
from email.utils import parseaddr

from app.core.config import settings
from app.core.logging import get_logger
from app.modules.support.email_inbound import EmailIn, html_to_text

log = get_logger("support.imap")

TIMEOUT_SECONDS = 25
BATCH_SIZE = 50
MAX_MESSAGE_BYTES = 25 * 1024 * 1024
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_KEPT_HEADERS = ("auto-submitted", "precedence", "x-autoreply", "x-autorespond", "list-id", "x-auto-response-suppress")


class IMAPSyncError(Exception):
    """A safe, user-presentable failure (never contains credentials)."""


@dataclass
class Fetched:
    uid: int
    email: EmailIn | None  # None = malformed / oversized, skipped but the cursor still moves past it


@dataclass
class FetchResult:
    uidvalidity: str
    items: list[Fetched]


def configured() -> bool:
    return bool(settings.SUPPORT_IMAP_HOST and settings.SUPPORT_IMAP_USER and settings.SUPPORT_IMAP_PASSWORD)


def enabled() -> bool:
    return settings.SUPPORT_IMAP_SYNC_ENABLED and configured()


def _imap_date(d: datetime) -> str:
    return f"{d.day:02d}-{_MONTHS[d.month - 1]}-{d.year}"  # locale-independent, as the protocol requires


def _connect() -> imaplib.IMAP4_SSL:
    try:
        conn = imaplib.IMAP4_SSL(settings.SUPPORT_IMAP_HOST, settings.SUPPORT_IMAP_PORT, ssl_context=ssl.create_default_context(), timeout=TIMEOUT_SECONDS)
    except (OSError, TimeoutError, ssl.SSLError) as e:
        raise IMAPSyncError(f"Couldn't reach the mail server ({type(e).__name__})") from None
    try:
        conn.login(settings.SUPPORT_IMAP_USER, settings.SUPPORT_IMAP_PASSWORD)
    except imaplib.IMAP4.error:
        _close(conn)
        raise IMAPSyncError("The mail server rejected the support mailbox sign-in") from None
    return conn


def _close(conn: imaplib.IMAP4_SSL) -> None:
    try:
        conn.logout()
    except (imaplib.IMAP4.error, OSError):
        pass


def _examine(conn: imaplib.IMAP4_SSL) -> str:
    """Opens the folder READ-ONLY and returns its UIDVALIDITY."""
    typ, _ = conn.select(f'"{settings.SUPPORT_IMAP_FOLDER}"', readonly=True)
    if typ != "OK":
        raise IMAPSyncError("The support mailbox folder couldn't be opened")
    _, data = conn.response("UIDVALIDITY")
    return data[0].decode() if data and data[0] else "0"


def test_login() -> None:
    conn = _connect()
    try:
        _examine(conn)
    finally:
        _close(conn)


def _text_of(msg: EmailMessage) -> str:
    body = msg.get_body(preferencelist=("plain", "html"))
    if body is None:
        return ""
    try:
        content = body.get_content()
    except (LookupError, UnicodeDecodeError, ValueError):
        content = (body.get_payload(decode=True) or b"").decode("utf-8", "replace")
    return html_to_text(content) if body.get_content_type() == "text/html" else content.strip()


def parse_message(raw: bytes, *, uid: int, uidvalidity: str) -> EmailIn | None:
    """RFC 5322 bytes → EmailIn. Returns None when there's no usable sender (nothing to thread or reply to)."""
    msg = message_from_bytes(raw, policy=policy.default)
    name, address = parseaddr(str(msg.get("From", "")))
    address = address.strip().lower()
    if not address or "@" not in address:
        return None
    message_id = str(msg.get("Message-ID", "")).strip() or f"<imap-{uidvalidity}-{uid}@{settings.SUPPORT_IMAP_HOST}>"
    in_reply_to = (re.findall(r"<[^>]+>", str(msg.get("In-Reply-To", ""))) or [None])[0]
    refs = re.findall(r"<[^>]+>", str(msg.get("References", "")))
    attachments = []
    for part in msg.iter_attachments():
        try:
            data = part.get_payload(decode=True)
        except (LookupError, ValueError):
            continue
        if data:
            attachments.append({"name": part.get_filename() or "attachment", "mime": part.get_content_type(), "data": data})
    headers = {k: str(msg.get(k)) for k in _KEPT_HEADERS if msg.get(k) is not None}
    return EmailIn(message_id=message_id, sender_email=address, sender_name=name or None, subject=str(msg.get("Subject", "")).strip(),
                   body=_text_of(msg), in_reply_to=in_reply_to, references=refs, attachments=attachments, headers=headers)


def fetch_new(last_uid: int | None, last_validity: str | None) -> FetchResult:
    """Blocking: connects, finds mail newer than the cursor and returns it parsed. Run via `asyncio.to_thread`."""
    conn = _connect()
    try:
        validity = _examine(conn)
        if last_uid is not None and last_validity == validity:
            typ, data = conn.uid("SEARCH", None, f"UID {last_uid + 1}:*")
        else:  # first run, or the server renumbered the mailbox: start from the lookback window (dedupe covers overlap)
            since = _imap_date(datetime.now(UTC) - timedelta(days=settings.SUPPORT_EMAIL_LOOKBACK_DAYS))
            typ, data = conn.uid("SEARCH", None, "SINCE", since)
        if typ != "OK":
            raise IMAPSyncError("The mail server couldn't search the support mailbox")
        floor = last_uid if (last_uid is not None and last_validity == validity) else 0
        uids = sorted(int(u) for u in (data[0] or b"").split() if int(u) > floor)[:BATCH_SIZE]  # `n:*` always returns the newest message
        items: list[Fetched] = []
        for uid in uids:
            typ, size_data = conn.uid("FETCH", str(uid), "(RFC822.SIZE)")
            size_match = re.search(rb"RFC822\.SIZE (\d+)", b" ".join(x if isinstance(x, bytes) else x[0] for x in (size_data or []) if x))
            if typ != "OK" or (size_match and int(size_match.group(1)) > MAX_MESSAGE_BYTES):
                log.warning("support.imap_message_skipped", extra={"_extra_fields": {"uid": uid, "reason": "size"}})
                items.append(Fetched(uid, None))
                continue
            typ, msg_data = conn.uid("FETCH", str(uid), "(BODY.PEEK[])")  # PEEK: does not set \Seen
            raw = next((x[1] for x in (msg_data or []) if isinstance(x, tuple)), None)
            try:
                parsed = parse_message(raw, uid=uid, uidvalidity=validity) if typ == "OK" and raw else None
            except Exception:  # noqa: BLE001 - a malformed message must never stop the rest of the mailbox from syncing
                log.warning("support.imap_message_malformed", extra={"_extra_fields": {"uid": uid}})
                parsed = None
            items.append(Fetched(uid, parsed))
        return FetchResult(validity, items)
    except imaplib.IMAP4.error:
        raise IMAPSyncError("The mail server returned an error while reading the support mailbox") from None
    except (OSError, TimeoutError, ssl.SSLError) as e:
        raise IMAPSyncError(f"Lost connection to the mail server ({type(e).__name__})") from None
    finally:
        _close(conn)


async def fetch_new_async(last_uid: int | None, last_validity: str | None) -> FetchResult:
    return await asyncio.to_thread(fetch_new, last_uid, last_validity)


__all__ = ["FetchResult", "Fetched", "IMAPSyncError", "configured", "enabled", "fetch_new_async", "parse_message", "test_login"]
