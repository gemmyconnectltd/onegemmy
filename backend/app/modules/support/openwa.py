"""OpenWA (https://github.com/rmyndharis/OpenWA, MIT) WhatsApp gateway adapter.

Everything OpenWA-specific is in this file so the support center can later move to the official WhatsApp Business
Platform by replacing it. OpenWA is self-hosted and reachable only from the backend over the private network
(OPENWA_BASE_URL); the API key, webhook secret and WhatsApp session never reach a browser.

Verified against the OpenWA documentation: REST under /api with an X-API-Key header; POST /sessions, POST
/sessions/:id/start, GET /sessions/:id/qr, GET /sessions/:id, POST /sessions/:id/messages/send-text,
media sends, POST /sessions/:id/webhooks; webhook deliveries carry X-OpenWA-Signature ("sha256=" + HMAC-SHA256
of the raw body), X-OpenWA-Delivery-Id and X-OpenWA-Event. NOT verified (the docs excerpt I could read doesn't show
it): the exact JSON envelope of a webhook delivery — `parse_webhook` therefore accepts the plausible shapes and
should be checked against a real delivery before go-live."""
import base64
import hashlib
import hmac
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.modules.support import hub, service
from app.modules.support.models import SupportChannel, SupportWebhookEvent

log = get_logger("support.openwa")

CHANNEL_KIND = "whatsapp"
_STATUS_MAP = {
    "ready": "connected", "qr_ready": "awaiting_qr", "initializing": "connecting", "authenticating": "connecting",
    "created": "disconnected", "disconnected": "disconnected", "action_required": "error", "failed": "error",
}
WEBHOOK_EVENTS = ["message.received", "message.sent", "message.ack", "message.failed", "session.status"]
CORE_WEBHOOK_EVENTS = ["message.received", "message.failed", "session.status"]  # the ones the docs name explicitly


class OpenWAError(Exception):
    """A readable failure (never contains the API key or message bodies)."""


def configured() -> bool:
    return bool(settings.OPENWA_BASE_URL and settings.OPENWA_API_KEY)


def verify_signature(raw_body: bytes, signature: str | None, secret: str | None = None) -> bool:
    secret = secret if secret is not None else settings.OPENWA_WEBHOOK_SECRET
    if not secret or not signature:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.strip(), expected)


async def _request(method: str, path: str, *, json: dict | None = None, headers: dict | None = None, expect_bytes: bool = False):
    if not configured():
        raise OpenWAError("WhatsApp isn't configured on the server (OPENWA_BASE_URL / OPENWA_API_KEY).")
    try:
        async with httpx.AsyncClient(base_url=settings.OPENWA_BASE_URL.rstrip("/"), timeout=20) as client:
            res = await client.request(method, path, json=json, headers={"X-API-Key": settings.OPENWA_API_KEY, **(headers or {})})
    except httpx.HTTPError as e:
        raise OpenWAError("Couldn't reach the WhatsApp gateway. Check that OpenWA is running.") from e
    if res.status_code >= 400:
        raise OpenWAError(f"The WhatsApp gateway refused the request ({res.status_code}).")
    if expect_bytes:
        return res.content
    return res.json() if res.content else None


# ── channel state ───────────────────────────────────────────────────────────────────────────────────────────

async def get_channel(db: AsyncSession) -> SupportChannel:
    ch = (await db.execute(select(SupportChannel).where(SupportChannel.kind == CHANNEL_KIND, SupportChannel.name == settings.OPENWA_SESSION_NAME))).scalars().first()
    if ch is None:
        ch = SupportChannel(kind=CHANNEL_KIND, name=settings.OPENWA_SESSION_NAME, status="disconnected", state={})
        db.add(ch)
        await db.flush()
    return ch


def _apply_session(ch: SupportChannel, session: dict) -> None:
    status = _STATUS_MAP.get(str(session.get("status", "")).lower(), "disconnected")
    was = ch.status
    ch.status = status
    ch.identity = session.get("phone") or ch.identity
    if status == "connected":
        ch.last_error = None
        if was != "connected":
            ch.last_connected_at = datetime.now(UTC)
    elif session.get("lastError"):
        ch.last_error = str(session["lastError"])[:300]
    ch.state = {**(ch.state or {}), "session_id": session.get("id") or (ch.state or {}).get("session_id")}
    if was == "connected" and status in ("disconnected", "error"):
        hub.publish({"type": "whatsapp.disconnected", "status": status})


async def refresh_status(db: AsyncSession) -> SupportChannel:
    ch = await get_channel(db)
    sid = (ch.state or {}).get("session_id")
    if not configured() or not sid:
        return ch
    try:
        _apply_session(ch, await _request("GET", f"/sessions/{sid}"))
    except OpenWAError as e:
        ch.last_error = str(e)
    await db.commit()
    return ch


async def connect(db: AsyncSession) -> SupportChannel:
    """Creates the session if needed, starts it (QR login) and registers the webhook. Idempotent."""
    ch = await get_channel(db)
    sid = (ch.state or {}).get("session_id")
    if sid:
        try:
            _apply_session(ch, await _request("GET", f"/sessions/{sid}"))
        except OpenWAError:
            sid = None  # gone on the gateway side: create it again
    if not sid:
        session = await _request("POST", "/sessions", json={"name": settings.OPENWA_SESSION_NAME})
        sid = session["id"]
        _apply_session(ch, session)
    if ch.status != "connected":
        _apply_session(ch, await _request("POST", f"/sessions/{sid}/start") or {"id": sid, "status": "initializing"})
    await _ensure_webhook(sid)
    await db.commit()
    return ch


async def _ensure_webhook(session_id: str) -> None:
    if not settings.OPENWA_WEBHOOK_TARGET or not settings.OPENWA_WEBHOOK_SECRET:
        raise OpenWAError("Webhook target/secret aren't configured (OPENWA_WEBHOOK_TARGET / OPENWA_WEBHOOK_SECRET).")
    url = f"{settings.OPENWA_WEBHOOK_TARGET.rstrip('/')}/api/v1/support/webhooks/openwa"
    try:
        existing = await _request("GET", f"/sessions/{session_id}/webhooks")
        if isinstance(existing, list) and any(w.get("url") == url for w in existing):
            return
    except OpenWAError:
        pass  # listing is a nicety; creating below is what matters
    for events in (WEBHOOK_EVENTS, CORE_WEBHOOK_EVENTS):
        try:
            await _request("POST", f"/sessions/{session_id}/webhooks", json={"url": url, "events": events, "secret": settings.OPENWA_WEBHOOK_SECRET})
            return
        except OpenWAError:
            continue
    raise OpenWAError("Couldn't register the webhook with the WhatsApp gateway.")


async def get_qr(db: AsyncSession) -> dict:
    ch = await get_channel(db)
    sid = (ch.state or {}).get("session_id")
    if not sid:
        raise OpenWAError("Start the connection first.")
    data = await _request("GET", f"/sessions/{sid}/qr")
    return {"qr": (data or {}).get("qrCode"), "status": (data or {}).get("status")}


async def disconnect(db: AsyncSession) -> SupportChannel:
    """Safe disconnect: logs the linked device out, stops the session and forgets nothing else (history stays)."""
    ch = await get_channel(db)
    sid = (ch.state or {}).get("session_id")
    if sid and configured():
        for step in ("logout", "stop"):
            try:
                await _request("POST", f"/sessions/{sid}/{step}")
            except OpenWAError:
                continue
    ch.status, ch.last_error = "disconnected", None
    await db.commit()
    return ch


# ── sending ─────────────────────────────────────────────────────────────────────────────────────────────────

def chat_id_for(phone: str | None, thread_id: str) -> str:
    return thread_id if "@" in thread_id else f"{service.digits(phone)}@c.us"


async def send_text(db: AsyncSession, chat_id: str, text: str, idempotency_key: str) -> str:
    ch = await get_channel(db)
    sid = (ch.state or {}).get("session_id")
    if not sid or ch.status != "connected":
        raise OpenWAError("WhatsApp isn't connected. Reconnect it in Support → Settings.")
    res = await _request("POST", f"/sessions/{sid}/messages/send-text", json={"chatId": chat_id, "text": text}, headers={"Idempotency-Key": idempotency_key})
    return str((res or {}).get("messageId") or "")


async def send_file(db: AsyncSession, chat_id: str, data: bytes, filename: str, mime: str, caption: str) -> str:
    ch = await get_channel(db)
    sid = (ch.state or {}).get("session_id")
    if not sid or ch.status != "connected":
        raise OpenWAError("WhatsApp isn't connected. Reconnect it in Support → Settings.")
    route = "send-image" if mime.startswith("image/") else "send-document"
    body = {"chatId": chat_id, "base64": base64.b64encode(data).decode(), "mimetype": mime, "filename": filename, "caption": caption}
    res = await _request("POST", f"/sessions/{sid}/messages/{route}", json=body)
    return str((res or {}).get("messageId") or "")


async def download_media(db: AsyncSession, chat_id: str, message_id: str) -> bytes:
    ch = await get_channel(db)
    sid = (ch.state or {}).get("session_id")
    return await _request("GET", f"/sessions/{sid}/messages/{chat_id}/{message_id}/media", expect_bytes=True)


# ── webhook ─────────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class WaEvent:
    kind: str  # received | status | session
    message_id: str | None = None
    chat_id: str | None = None
    phone: str | None = None
    name: str | None = None
    body: str = ""
    media: dict | None = None
    has_media: bool = False
    from_me: bool = False
    status: str | None = None
    error: str | None = None
    session_status: str | None = None
    session: dict | None = None


def _first(d: dict, *keys, default=None):
    for k in keys:
        if d.get(k) not in (None, ""):
            return d[k]
    return default


def _wid(value) -> str | None:
    if isinstance(value, dict):
        value = _first(value, "_serialized", "id", "serialized")
    return str(value) if value else None


def parse_webhook(event_name: str | None, payload: dict) -> WaEvent | None:
    """Normalises a delivery into a WaEvent. Returns None for things the support center ignores (groups, broadcasts,
    status updates, calls, unknown events)."""
    name = (event_name or _first(payload, "event", "type", default="") or "").lower()
    data = _first(payload, "data", "payload", "message", default=None)
    data = data if isinstance(data, dict) else payload
    if name.startswith("session"):
        return WaEvent(kind="session", session_status=str(_first(data, "status", "state", default="")).lower(), session=data,
                       error=_first(data, "lastError", "error"))
    if name in ("message.received", "message", "message.create"):
        chat_id = _first(data, "chatId", "from")
        if not chat_id or chat_id.endswith(("@g.us", "@broadcast", "@newsletter")) or data.get("isGroup"):
            return None
        phone = _first(data, "senderPhone") or (chat_id.split("@")[0] if chat_id.endswith("@c.us") else None)
        media = data.get("media") if isinstance(data.get("media"), dict) else None
        return WaEvent(
            kind="received", message_id=_wid(_first(data, "id", "waMessageId", "messageId")), chat_id=chat_id, phone=phone,
            name=_first(data, "pushName", "notifyName", "senderName", "chatName"), body=str(_first(data, "body", "text", default="") or ""),
            media=media, has_media=bool(media or data.get("hasMedia") or data.get("mediaPath")), from_me=bool(_first(data, "fromMe", default=False)),
        )
    status = {"message.sent": "sent", "message.delivered": "delivered", "message.read": "read", "message.failed": "failed"}.get(name)
    if name == "message.ack":
        ack = _first(data, "status", "ack", default=None)
        status = {1: "sent", 2: "delivered", 3: "read", 4: "read", "sent": "sent", "delivered": "delivered", "read": "read", "failed": "failed"}.get(
            ack if not isinstance(ack, str) else ack.lower())
    if status:
        return WaEvent(kind="status", message_id=_wid(_first(data, "id", "waMessageId", "messageId")), status=status,
                       error=_first(data, "error", "reason"))
    return None


async def record_webhook_delivery(db: AsyncSession, delivery_id: str, event: str | None) -> bool:
    """True the first time a delivery id is seen; False for a retry of one already processed."""
    try:
        async with db.begin_nested():
            db.add(SupportWebhookEvent(provider="whatsapp", delivery_id=delivery_id, event=event))
            await db.flush()
        return True
    except IntegrityError:
        return False


async def handle_event(db: AsyncSession, ev: WaEvent) -> None:
    if ev.kind == "session":
        ch = await get_channel(db)
        if ev.session_status:
            _apply_session(ch, {**(ev.session or {}), "status": ev.session_status})
        return
    if ev.kind == "status" and ev.message_id and ev.status:
        await service.update_delivery(db, "whatsapp", ev.message_id, ev.status, ev.error)
        return
    if ev.kind != "received" or ev.from_me or not ev.chat_id:
        return
    attachments = None
    if ev.has_media:
        attachments = await _store_media(db, ev)
    if not ev.body and not attachments:
        return
    msg, conv, created = await service.ingest_incoming(
        db, channel="whatsapp", thread_id=ev.chat_id, provider_message_id=ev.message_id or f"wa-{uuid.uuid4().hex}", body=ev.body,
        customer_name=ev.name, customer_phone=ev.phone, attachments=attachments,
    )
    if msg is not None and created and conv is not None:
        await service.maybe_acknowledge(db, conv, automated=False, sender=_ack_sender(db))


def _ack_sender(db: AsyncSession):
    async def send(conv, text: str) -> bool:
        try:
            await send_text(db, chat_id_for(conv.customer_phone, conv.external_thread_id), text, f"ack-{conv.id}")
            return True
        except OpenWAError:
            log.warning("support.ack_failed", extra={"_extra_fields": {"conversation_id": str(conv.id)}})
            return False
    return send


async def _store_media(db: AsyncSession, ev: WaEvent) -> list[dict] | None:
    try:
        mime, data, name = None, None, "attachment"
        if ev.media and ev.media.get("data"):
            data, mime, name = base64.b64decode(ev.media["data"]), ev.media.get("mimetype"), ev.media.get("filename") or name
        elif ev.message_id and ev.chat_id:
            data = await download_media(db, ev.chat_id, ev.message_id)
            mime = (ev.media or {}).get("mimetype") or "application/octet-stream"
        if not data:
            return None
        return [service.save_attachment(data, name, mime)]
    except (OpenWAError, ValueError, KeyError, ValidationError):  # an unsupported/oversized file must never lose the text
        log.warning("support.media_skipped", extra={"_extra_fields": {"message_id": ev.message_id}})
        return None


# ── health / reconnect ──────────────────────────────────────────────────────────────────────────────────────

async def health_tick(db: AsyncSession) -> None:
    """Called periodically. Refreshes the session status, raises a staff alert on a drop, and tries to restart a
    dropped session (at most every 5 minutes). A session that needs a new QR scan can't be fixed automatically —
    the alert tells staff to scan again in Support → Settings."""
    if not configured():
        return
    ch = await get_channel(db)
    sid = (ch.state or {}).get("session_id")
    if not sid:
        return
    await refresh_status(db)
    if ch.status in ("disconnected", "error"):
        last = (ch.state or {}).get("last_restart")
        recent = last and (datetime.now(UTC) - datetime.fromisoformat(last)).total_seconds() < 300
        if not recent:
            ch.state = {**(ch.state or {}), "last_restart": datetime.now(UTC).isoformat()}
            try:
                _apply_session(ch, await _request("POST", f"/sessions/{sid}/start") or {"id": sid, "status": "initializing"})
            except OpenWAError as e:
                ch.last_error = str(e)
            await db.commit()
