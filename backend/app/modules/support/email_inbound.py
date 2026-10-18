"""Support email: inbound sync (Microsoft Graph) and threaded replies (the existing SMTP sender).

Audit result this is built on: Pesaa's existing email is outbound-only SMTP (app/core/email.py — host/user/password
from environment; Outlook works by pointing SMTP_HOST at smtp.office365.com). There is NO inbound mail code,
IMAP or Graph anywhere. Outbound support replies therefore reuse that exact SMTP path (sender="support"). Inbound
mail needs Microsoft Graph with an Entra app registration (app-only, Mail.ReadWrite on the support mailbox) — the
credentials below are NOT configured in this repo, so inbound sync stays off until they are, and everything in
`sync_mailbox` is untested against a real mailbox. The parsing/threading core (`ingest_email`) is tested."""
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from html import unescape

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_email_message
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.modules.support import service
from app.modules.support.models import SupportChannel, SupportConversation, SupportMessage

log = get_logger("support.email")

CHANNEL_KIND = "email"
_token: dict = {"value": None, "expires": datetime.min.replace(tzinfo=UTC)}


def configured() -> bool:
    return bool(settings.SUPPORT_MAILBOX and settings.GRAPH_TENANT_ID and settings.GRAPH_CLIENT_ID and settings.GRAPH_CLIENT_SECRET)


def outbound_configured() -> bool:
    return bool((settings.SUPPORT_SMTP_USER or settings.SMTP_USER) and (settings.SUPPORT_SMTP_PASSWORD or settings.SMTP_PASSWORD))


@dataclass
class EmailIn:
    message_id: str  # RFC 5322 Message-ID (internetMessageId)
    sender_email: str
    sender_name: str | None
    subject: str
    body: str
    in_reply_to: str | None = None
    references: list[str] = field(default_factory=list)
    graph_conversation_id: str | None = None
    attachments: list[dict] = field(default_factory=list)  # [{name, mime, data(bytes)}]
    headers: dict[str, str] = field(default_factory=dict)


def html_to_text(html: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?</\1>", "", html or "")
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", text)
    text = unescape(re.sub(r"<[^>]+>", "", text))
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()


def strip_quoted_reply(text: str) -> str:
    """Drops the quoted history a mail client appends, so each message in the thread shows only what's new."""
    cut = re.search(r"(?im)^(on .{5,120} wrote:|-{2,}\s*original message\s*-{2,}|from:\s.+\n(sent|date):)", text)
    return (text[: cut.start()] if cut else text).strip() or text.strip()


async def _resolve_thread(db: AsyncSession, m: EmailIn) -> SupportConversation | None:
    """Reply → existing conversation. Order: our own Message-IDs named in In-Reply-To/References (exact), then the
    mail provider's conversation id, then the same sender + same normalised subject on a still-open conversation."""
    ids = [i for i in ([m.in_reply_to] if m.in_reply_to else []) + m.references if i]
    if ids:
        row = (await db.execute(select(SupportMessage).where(SupportMessage.provider == "email", SupportMessage.provider_message_id.in_(ids)).limit(1))).scalars().first()
        if row:
            return await db.get(SupportConversation, row.conversation_id)
    if m.graph_conversation_id:
        c = (await db.execute(select(SupportConversation).where(SupportConversation.channel == "email", SupportConversation.external_thread_id == f"graph:{m.graph_conversation_id}"))).scalars().first()
        if c:
            return c
    subj = service.normalize_subject(m.subject)
    if subj:
        c = (await db.execute(select(SupportConversation).where(
            SupportConversation.channel == "email", SupportConversation.customer_email == m.sender_email.lower(), SupportConversation.status == "open",
        ).order_by(SupportConversation.last_message_at.desc().nulls_last()).limit(20))).scalars().all()
        for cand in c:
            if service.normalize_subject(cand.subject) == subj:
                return cand
    return None


async def ingest_email(db: AsyncSession, m: EmailIn) -> tuple[bool, SupportConversation | None]:
    """Stores one inbound email (deduplicated by Message-ID), threads it, and sends the optional acknowledgement.
    Returns (imported, conversation)."""
    sender = m.sender_email.lower().strip()
    if sender and sender == (settings.SUPPORT_MAILBOX or "").lower():
        return False, None  # our own sent mail echoed back by the mailbox
    attachments = []
    for a in m.attachments:
        try:
            attachments.append(service.save_attachment(a["data"], a["name"], a.get("mime")))
        except ValidationError:
            log.warning("support.email_attachment_skipped")
    thread = f"graph:{m.graph_conversation_id}" if m.graph_conversation_id else f"mail:{m.message_id}"
    msg, conv, created = await service.ingest_incoming(
        db, channel="email", thread_id=thread, provider_message_id=m.message_id, body=strip_quoted_reply(m.body),
        customer_name=m.sender_name, customer_email=sender, subject=m.subject, attachments=attachments or None, headers=m.headers,
        thread_resolver=lambda session: _resolve_thread(session, m),
    )
    if msg is None:
        return False, conv
    refs = list(dict.fromkeys(((conv.meta or {}).get("refs") or []) + m.references + [m.message_id]))[-20:]
    conv.meta = {**(conv.meta or {}), "refs": refs, "last_incoming_id": m.message_id}
    if created:
        await service.maybe_acknowledge(db, conv, automated=service.is_automated_sender(sender, m.headers), sender=_ack_sender(m.message_id, refs))
    return True, conv


def _ack_sender(parent_id: str, refs: list[str]):
    async def send(conv, text: str) -> bool:
        if not conv.customer_email:
            return False
        subject = f"Re: {conv.subject}" if conv.subject else "Your message to Pesaa support"
        sent = await send_email_message(conv.customer_email, subject, f"<p>{text}</p>", text, sender="support", headers={
            "In-Reply-To": parent_id, "References": " ".join(refs), "Auto-Submitted": "auto-replied", "Precedence": "bulk"})
        return sent is not None
    return send


async def send_reply(conv: SupportConversation, body: str, attachments: list[tuple[str, str, bytes]]) -> str | None:
    """Reply on the thread: same subject, In-Reply-To the customer's last message, References chain preserved."""
    if not conv.customer_email:
        raise ValidationError("This conversation has no customer email address")
    refs = (conv.meta or {}).get("refs") or []
    parent = (conv.meta or {}).get("last_incoming_id")
    subject = conv.subject or "Pesaa support"
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"
    headers = {}
    if parent:
        headers = {"In-Reply-To": parent, "References": " ".join(refs[-10:])}
    html = "<div style=\"white-space:pre-wrap;font-family:Segoe UI,Arial,sans-serif;font-size:14px\">" + re.sub(r"<", "&lt;", body) + "</div>"
    return await send_email_message(conv.customer_email, subject, html, body, sender="support", headers=headers, attachments=attachments or None)


# ── Microsoft Graph (inbound) ───────────────────────────────────────────────────────────────────────────────

async def _graph_token() -> str:
    if _token["value"] and _token["expires"] > datetime.now(UTC) + timedelta(minutes=2):
        return _token["value"]
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(
            f"https://login.microsoftonline.com/{settings.GRAPH_TENANT_ID}/oauth2/v2.0/token",
            data={"client_id": settings.GRAPH_CLIENT_ID, "client_secret": settings.GRAPH_CLIENT_SECRET,
                  "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"})
    if res.status_code != 200:
        raise ValidationError("Couldn't sign in to Microsoft Graph for the support mailbox.")
    body = res.json()
    _token["value"], _token["expires"] = body["access_token"], datetime.now(UTC) + timedelta(seconds=int(body.get("expires_in", 3000)))
    return _token["value"]


def _from_graph(item: dict) -> EmailIn:
    sender = (item.get("from") or {}).get("emailAddress") or {}
    headers = {h["name"]: h["value"] for h in item.get("internetMessageHeaders") or []}
    body = item.get("body") or {}
    text = html_to_text(body.get("content", "")) if (body.get("contentType") or "").lower() == "html" else (body.get("content") or "")
    refs = re.findall(r"<[^>]+>", headers.get("References", ""))
    return EmailIn(
        message_id=item.get("internetMessageId") or item["id"], sender_email=(sender.get("address") or "").lower(), sender_name=sender.get("name"),
        subject=item.get("subject") or "", body=text, in_reply_to=(re.findall(r"<[^>]+>", headers.get("In-Reply-To", "")) or [None])[0],
        references=refs, graph_conversation_id=item.get("conversationId"), headers=headers,
    )


async def sync_mailbox(db: AsyncSession) -> int:
    """Imports mail received since the stored cursor. Returns the number of messages imported."""
    if not configured():
        return 0
    ch = (await db.execute(select(SupportChannel).where(SupportChannel.kind == CHANNEL_KIND, SupportChannel.name == settings.SUPPORT_MAILBOX))).scalars().first()
    if ch is None:
        ch = SupportChannel(kind=CHANNEL_KIND, name=settings.SUPPORT_MAILBOX, identity=settings.SUPPORT_MAILBOX, status="connected", state={})
        db.add(ch)
        await db.flush()
    since = (ch.state or {}).get("cursor") or (datetime.now(UTC) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        token = await _graph_token()
        url = f"https://graph.microsoft.com/v1.0/users/{settings.SUPPORT_MAILBOX}/mailFolders/inbox/messages"
        params = {"$filter": f"receivedDateTime gt {since}", "$orderby": "receivedDateTime asc", "$top": "50",
                  "$select": "id,internetMessageId,subject,from,body,receivedDateTime,conversationId,hasAttachments,internetMessageHeaders"}
        async with httpx.AsyncClient(timeout=30, headers={"Authorization": f"Bearer {token}"}) as client:
            res = await client.get(url, params=params)
            if res.status_code != 200:
                raise ValidationError(f"Microsoft Graph returned {res.status_code} for the support mailbox.")
            imported, last = 0, since
            for item in res.json().get("value", []):
                m = _from_graph(item)
                if item.get("hasAttachments"):
                    ares = await client.get(f"{url}/{item['id']}/attachments")
                    if ares.status_code == 200:
                        import base64
                        m.attachments = [{"name": a.get("name"), "mime": a.get("contentType"), "data": base64.b64decode(a["contentBytes"])}
                                         for a in ares.json().get("value", []) if a.get("contentBytes")]
                ok, _ = await ingest_email(db, m)
                imported += int(ok)
                last = item["receivedDateTime"]
        ch.state = {**(ch.state or {}), "cursor": last}
        ch.status, ch.last_error, ch.last_connected_at = "connected", None, datetime.now(UTC)
        await db.commit()
        return imported
    except (httpx.HTTPError, ValidationError) as e:
        ch.status, ch.last_error = "error", str(e)[:300]
        await db.commit()
        return 0
