"""Outgoing replies, dispatched to the conversation's channel."""
import uuid
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.modules.support import email_inbound, openwa, service
from app.modules.support.models import SupportConversation, SupportMessage
from app.modules.tenants.models import User

log = get_logger("support.messaging")
_ALG = "HS256"
# A different key than login tokens use, so a staged-attachment token can never be mistaken for a session token.
_KEY = settings.SECRET_KEY + ":support-attachment"


def stage_token(meta: dict, user: User) -> str:
    """Uploaded-but-not-yet-sent attachments are referenced by a short-lived signed token (no staging table):
    it proves the file was uploaded by this staff member through the validated upload endpoint."""
    claims = {"att": meta, "uid": str(user.id), "exp": datetime.now(UTC) + timedelta(hours=2)}
    return jwt.encode(claims, _KEY, algorithm=_ALG)


def resolve_token(token: str, user: User) -> dict:
    try:
        claims = jwt.decode(token, _KEY, algorithms=[_ALG])
    except JWTError as e:
        raise ValidationError("An attachment expired or is invalid — upload it again") from e
    if claims.get("uid") != str(user.id):
        raise ValidationError("An attachment expired or is invalid — upload it again")
    return claims["att"]


async def send_reply(db: AsyncSession, user: User, conv: SupportConversation, body: str, tokens: list[str]) -> SupportMessage:
    body = (body or "").strip()
    atts = [resolve_token(t, user) for t in tokens]
    if not body and not atts:
        raise ValidationError("Write a message or attach a file")
    if conv.status == "resolved":
        conv.status, conv.resolved_at = "open", None  # replying reopens
    provider = {"whatsapp": "whatsapp", "email": "email"}.get(conv.channel)
    status, provider_id, error = "sent", None, None
    files = [(a["name"], a["mime"], service.attachment_file(a).read_bytes()) for a in atts]
    try:
        if conv.channel == "whatsapp":
            chat = openwa.chat_id_for(conv.customer_phone, conv.external_thread_id)
            key = uuid.uuid4().hex
            if body:
                provider_id = await openwa.send_text(db, chat, body, key)
            for i, (name, mime, data) in enumerate(files):
                pid = await openwa.send_file(db, chat, data, name, mime, body if (i == 0 and not provider_id) else "")
                provider_id = provider_id or pid
        elif conv.channel == "email":
            provider_id = await email_inbound.send_reply(conv, body, files)
            if provider_id is None:
                raise ValidationError("The email couldn't be sent — check the support mailbox settings")
            conv.meta = {**(conv.meta or {}), "refs": ((conv.meta or {}).get("refs") or []) + [provider_id]}
        else:  # portal ticket: the tenant reads it in Help & Support
            status = "delivered"
    except (openwa.OpenWAError, ValidationError) as e:
        status, error = "failed", str(getattr(e, "detail", None) or e)[:300]
        log.warning("support.reply_failed", extra={"_extra_fields": {"conversation_id": str(conv.id), "channel": conv.channel}})
    return await service.record_outgoing(db, user, conv, body, atts, delivery_status=status, provider=provider, provider_message_id=provider_id or None, error=error)


async def retry_failed(db: AsyncSession, user: User, conv: SupportConversation, message: SupportMessage) -> SupportMessage:
    """Re-sends a failed reply (text only — attachments of a failed send should be re-uploaded)."""
    if message.delivery_status != "failed" or message.direction != "outgoing":
        raise ValidationError("Only failed messages can be retried")
    body = message.body
    await db.delete(message)
    await db.flush()
    return await send_reply(db, user, conv, body, [])
