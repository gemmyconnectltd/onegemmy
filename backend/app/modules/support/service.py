"""Support center business logic: conversations, messages, tickets, settings, staff.

Every channel (WhatsApp, email, tenant portal) feeds the same two tables. Channel adapters (openwa.py,
email_inbound.py) only translate a provider payload into `ingest_incoming()`; everything else — threading,
deduplication, unread counts, auto-acknowledgement, events — happens here once."""
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.logging import get_logger
from app.core.security import hash_password
from app.modules.audit.service import record_audit
from app.modules.support import hub
from app.modules.support.deps import AGENT, MANAGER, STAFF_ROLES, SUPERADMIN, is_manager
from app.modules.support.models import (
    CONVERSATION_STATUSES,
    PRIORITIES,
    TICKET_STATUSES,
    SupportConversation,
    SupportMessage,
    SupportSetting,
    SupportTicket,
)
from app.modules.support.schemas import (
    ConversationRead,
    MessageRead,
    StaffRead,
    SupportSettingsIO,
    TicketRead,
)
from app.modules.tenants.models import Tenant, User

log = get_logger("support")

UPLOAD_ROOT = Path(app_settings.UPLOAD_DIR) / "support"
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
ALLOWED_ATTACHMENT_MIMES = {
    "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain", "text/csv",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "audio/ogg", "audio/mpeg", "audio/mp4", "video/mp4",
}
_AUTOMATED_LOCALPARTS = ("noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "postmaster", "bounce")


# ── small helpers ───────────────────────────────────────────────────────────────────────────────────────────

def digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def preview(text: str, limit: int = 160) -> str:
    one = re.sub(r"\s+", " ", text or "").strip()
    return one if len(one) <= limit else one[: limit - 1] + "…"


def normalize_subject(subject: str | None) -> str:
    s = (subject or "").strip()
    while True:
        n = re.sub(r"^(re|fwd?|aw|sv)\s*:\s*", "", s, flags=re.IGNORECASE)
        if n == s:
            return s.lower()
        s = n


def is_automated_sender(email: str | None, headers: dict[str, str] | None = None) -> bool:
    """Bounces, no-reply systems and bulk/auto-generated mail never get an acknowledgement (no reply loops)."""
    local = (email or "").split("@")[0].lower()
    if any(local.startswith(p) for p in _AUTOMATED_LOCALPARTS):
        return True
    h = {k.lower(): (v or "").lower() for k, v in (headers or {}).items()}
    if h.get("auto-submitted", "no") not in ("", "no"):
        return True
    return h.get("precedence", "") in ("bulk", "junk", "list") or "x-autoreply" in h or "x-autorespond" in h


def safe_filename(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(name or "file").name).strip("._") or "file"
    return base[:120]


def save_attachment(data: bytes, name: str, mime: str | None) -> dict:
    """Stores one attachment under uploads/support and returns its metadata. Size and type are enforced; the file
    is only ever served through an authorized endpoint with Content-Disposition: attachment."""
    if len(data) > MAX_ATTACHMENT_BYTES:
        raise ValidationError("Attachments must be 10 MB or smaller")
    mime = (mime or "application/octet-stream").split(";")[0].strip().lower()
    if mime not in ALLOWED_ATTACHMENT_MIMES:
        raise ValidationError(f"This file type isn't supported ({mime})")
    att_id = uuid.uuid4().hex
    directory = UPLOAD_ROOT / att_id[:2]
    directory.mkdir(parents=True, exist_ok=True)
    filename = safe_filename(name)
    (directory / f"{att_id}_{filename}").write_bytes(data)
    return {"id": att_id, "name": filename, "mime": mime, "size": len(data), "path": f"{att_id[:2]}/{att_id}_{filename}"}


def attachment_file(att: dict) -> Path:
    path = (UPLOAD_ROOT / att["path"]).resolve()
    if UPLOAD_ROOT.resolve() not in path.parents or not path.exists():  # never follow a path out of the root
        raise NotFoundError("Attachment not found")
    return path


def message_to_read(m: SupportMessage, *, include_internal: bool = True) -> MessageRead:
    atts = [
        {"id": a["id"], "name": a["name"], "mime": a.get("mime"), "size": a.get("size"),
         "url": f"/api/v1/support/attachments/{m.id}/{a['id']}"}
        for a in (m.attachments or [])
    ]
    return MessageRead.model_validate({
        "id": m.id, "conversation_id": m.conversation_id, "direction": m.direction, "is_internal_note": m.is_internal_note,
        "sender_name": m.sender_name, "sender_user_id": m.sender_user_id, "body": m.body, "attachments": atts,
        "delivery_status": m.delivery_status, "delivery_error": m.delivery_error, "created_at": m.created_at,
    })


# ── settings ────────────────────────────────────────────────────────────────────────────────────────────────

async def get_settings(db: AsyncSession) -> SupportSettingsIO:
    row = await db.get(SupportSetting, "config")
    return SupportSettingsIO.model_validate(row.value) if row else SupportSettingsIO()


async def save_settings(db: AsyncSession, data: SupportSettingsIO, actor: User) -> SupportSettingsIO:
    try:
        ZoneInfo(data.timezone)
    except (ZoneInfoNotFoundError, ValueError) as e:
        raise ValidationError("Unknown time zone") from e
    for day, h in data.hours.items():
        if day not in ("mon", "tue", "wed", "thu", "fri", "sat", "sun"):
            raise ValidationError(f"Unknown day '{day}'")
        if h and (not re.fullmatch(r"\d\d:\d\d", h.open) or not re.fullmatch(r"\d\d:\d\d", h.close) or h.open >= h.close):
            raise ValidationError("Business hours need a valid opening time before closing time (HH:MM)")
    row = await db.get(SupportSetting, "config")
    if row is None:
        db.add(SupportSetting(key="config", value=data.model_dump()))
    else:
        row.value = data.model_dump()
    await record_audit(db, tenant_id=None, actor_user_id=actor.id, actor_name=actor.full_name, action="support.settings",
                       entity_type="support_settings", summary="Support settings updated")
    await db.commit()
    return data


def within_business_hours(cfg: SupportSettingsIO, now: datetime | None = None) -> bool:
    """No hours configured = always open (the safe default: no 'we're closed' message nobody asked for)."""
    if not cfg.hours:
        return True
    local = (now or datetime.now(UTC)).astimezone(ZoneInfo(cfg.timezone))
    day = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[local.weekday()]
    h = cfg.hours.get(day)
    if not h:
        return False
    return h.open <= local.strftime("%H:%M") < h.close


# ── reads ───────────────────────────────────────────────────────────────────────────────────────────────────

def _scope(stmt, user: User):
    """Agents only work conversations that are unassigned or theirs; managers and Super Admin see everything."""
    if is_manager(user):
        return stmt
    return stmt.where(or_(SupportConversation.assigned_to.is_(None), SupportConversation.assigned_to == user.id))


async def _names(db: AsyncSession, user_ids: set, tenant_ids: set) -> tuple[dict, dict]:
    users = {}
    tenants = {}
    if user_ids:
        users = {u.id: u.full_name for u in (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars()}
    if tenant_ids:
        tenants = {t.id: t.name for t in (await db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids)))).scalars()}
    return users, tenants


async def to_conversation_reads(db: AsyncSession, rows: list[SupportConversation]) -> list[ConversationRead]:
    users, tenants = await _names(db, {r.assigned_to for r in rows if r.assigned_to}, {r.tenant_id for r in rows if r.tenant_id})
    contact = {}
    if tenants:
        contact = dict((await db.execute(select(Tenant.id, Tenant.preferred_contact).where(Tenant.id.in_(tenants.keys())))).all())
    tickets = {}
    if rows:
        for t in (await db.execute(select(SupportTicket).where(
            SupportTicket.conversation_id.in_([r.id for r in rows]), SupportTicket.status != "closed",
        ).order_by(SupportTicket.created_at))).scalars():
            tickets[t.conversation_id] = t
    out = []
    for r in rows:
        t = tickets.get(r.id)
        out.append(ConversationRead.model_validate({
            **{c: getattr(r, c) for c in ConversationRead.model_fields if hasattr(r, c)},
            "tenant_name": tenants.get(r.tenant_id), "tenant_preferred_contact": contact.get(r.tenant_id), "assigned_name": users.get(r.assigned_to),
            "ticket_id": t.id if t else None, "ticket_reference": t.reference if t else None,
        }))
    return out


async def list_conversations(
    db: AsyncSession, user: User, *, view: str = "all", channel: str | None = None, search: str | None = None,
    page: int = 1, page_size: int = 30,
) -> tuple[list[ConversationRead], int]:
    stmt = _scope(select(SupportConversation), user)
    if view == "unassigned":
        stmt = stmt.where(SupportConversation.assigned_to.is_(None), SupportConversation.status == "open")
    elif view == "mine":
        stmt = stmt.where(SupportConversation.assigned_to == user.id, SupportConversation.status == "open")
    elif view == "resolved":
        stmt = stmt.where(SupportConversation.status == "resolved")
    else:
        stmt = stmt.where(SupportConversation.status == "open")
    if channel in ("whatsapp", "email", "portal"):
        stmt = stmt.where(SupportConversation.channel == channel)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(
            SupportConversation.customer_name.ilike(like), SupportConversation.customer_email.ilike(like),
            SupportConversation.customer_phone.ilike(like), SupportConversation.subject.ilike(like),
            SupportConversation.last_message_preview.ilike(like),
            select(SupportMessage.id).where(SupportMessage.conversation_id == SupportConversation.id,
                                            SupportMessage.is_internal_note.is_(False), SupportMessage.body.ilike(like)).exists(),
        ))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(
        stmt.order_by(SupportConversation.last_message_at.desc().nulls_last(), SupportConversation.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return await to_conversation_reads(db, list(rows)), total


async def get_conversation(db: AsyncSession, user: User, conversation_id: uuid.UUID) -> SupportConversation:
    conv = await db.get(SupportConversation, conversation_id)
    if conv is None:
        raise NotFoundError("Conversation not found")
    if not is_manager(user) and conv.assigned_to not in (None, user.id):
        raise ForbiddenError("This conversation is assigned to someone else")
    return conv


async def list_messages(
    db: AsyncSession, conversation_id: uuid.UUID, *, before: datetime | None = None, limit: int = 50,
    include_internal: bool = True,
) -> tuple[list[MessageRead], bool]:
    """Newest-first paging: returns up to `limit` messages older than `before`, oldest→newest, plus has_more."""
    stmt = select(SupportMessage).where(SupportMessage.conversation_id == conversation_id)
    if not include_internal:
        stmt = stmt.where(SupportMessage.is_internal_note.is_(False))
    if before:
        stmt = stmt.where(SupportMessage.created_at < before)
    rows = list((await db.execute(stmt.order_by(SupportMessage.created_at.desc()).limit(limit + 1))).scalars())
    has_more = len(rows) > limit
    return [message_to_read(m) for m in reversed(rows[:limit])], has_more


# ── ingest (shared by every inbound channel) ────────────────────────────────────────────────────────────────

async def link_tenant(db: AsyncSession, email: str | None, phone: str | None) -> tuple[uuid.UUID | None, str | None]:
    """Best-effort: which Pesaa business does this contact belong to? Matches a user by email or phone, then the
    business's own phone. No match is normal (a prospect) and just leaves the conversation unlinked."""
    if email:
        u = (await db.execute(select(User).where(func.lower(User.email) == email.lower(), User.tenant_id.is_not(None)).limit(1))).scalars().first()
        if u:
            return u.tenant_id, u.full_name
    d = digits(phone)
    if len(d) >= 8:
        tail = d[-9:]
        u = (await db.execute(select(User).where(User.tenant_id.is_not(None), User.phone.is_not(None),
                                                 func.regexp_replace(User.phone, r"\D", "", "g").like(f"%{tail}")).limit(1))).scalars().first()
        if u:
            return u.tenant_id, u.full_name
        t = (await db.execute(select(Tenant).where(Tenant.phone.is_not(None),
                                                   func.regexp_replace(Tenant.phone, r"\D", "", "g").like(f"%{tail}")).limit(1))).scalars().first()
        if t:
            return t.id, None
    return None, None


async def _get_or_create_conversation(db: AsyncSession, channel: str, thread_id: str, **fields) -> tuple[SupportConversation, bool]:
    existing = (await db.execute(select(SupportConversation).where(
        SupportConversation.channel == channel, SupportConversation.external_thread_id == thread_id))).scalars().first()
    if existing:
        return existing, False
    conv = SupportConversation(channel=channel, external_thread_id=thread_id, **fields)
    try:
        async with db.begin_nested():
            db.add(conv)
            await db.flush()
    except IntegrityError:  # lost a race with a concurrent delivery of the same thread
        existing = (await db.execute(select(SupportConversation).where(
            SupportConversation.channel == channel, SupportConversation.external_thread_id == thread_id))).scalars().one()
        return existing, False
    return conv, True


async def _message_exists(db: AsyncSession, provider: str, provider_message_id: str | None) -> bool:
    if not provider_message_id:
        return False
    return (await db.execute(select(SupportMessage.id).where(
        SupportMessage.provider == provider, SupportMessage.provider_message_id == provider_message_id).limit(1))).first() is not None


def _touch(conv: SupportConversation, *, text: str, incoming: bool) -> None:
    now = datetime.now(UTC)
    conv.last_message_at = now
    conv.last_message_preview = preview(text) or "(attachment)"
    if incoming:
        conv.unread_count = (conv.unread_count or 0) + 1


async def ingest_incoming(
    db: AsyncSession, *, channel: str, thread_id: str, provider_message_id: str | None, body: str,
    customer_name: str | None = None, customer_email: str | None = None, customer_phone: str | None = None,
    subject: str | None = None, attachments: list[dict] | None = None, headers: dict[str, str] | None = None,
    meta: dict | None = None, thread_resolver=None,
) -> tuple[SupportMessage | None, SupportConversation | None, bool]:
    """Stores one customer message. Returns (message, conversation, is_new_conversation). A message already seen
    (same provider id) returns (None, existing, False) — safe to call again with the same delivery."""
    if await _message_exists(db, channel, provider_message_id):
        return None, None, False
    if thread_resolver is not None:  # email: find an existing thread by headers/subject before opening a new one
        found = await thread_resolver(db)
        if found is not None:
            thread_id = found.external_thread_id
    tenant_id, linked_name = await link_tenant(db, customer_email, customer_phone)
    conv, created = await _get_or_create_conversation(
        db, channel, thread_id, subject=subject, customer_name=customer_name or linked_name, customer_email=customer_email,
        customer_phone=customer_phone, tenant_id=tenant_id, status="open", meta=meta,
    )
    if not created:
        if customer_name and not conv.customer_name:
            conv.customer_name = customer_name
        if conv.tenant_id is None and tenant_id:
            conv.tenant_id = tenant_id
        if meta:
            conv.meta = {**(conv.meta or {}), **meta}
    msg = SupportMessage(
        conversation_id=conv.id, direction="incoming", sender_name=customer_name or conv.customer_name or customer_email or customer_phone,
        body=body or "", attachments=attachments or None, provider=channel, provider_message_id=provider_message_id,
        delivery_status="delivered", meta={"headers": {k: v for k, v in (headers or {}).items() if k.lower() in ("in-reply-to", "references")}} if headers else None,
    )
    try:
        async with db.begin_nested():
            db.add(msg)
            await db.flush()
    except IntegrityError:  # duplicate delivery that slipped past the check: the unique index is the final guard
        return None, conv, False
    if channel == "whatsapp" and conv.tenant_id and (body or "").strip().lower() in ("stop", "unsubscribe"):
        tenant = await db.get(Tenant, conv.tenant_id)  # honours the "Reply STOP" line in outgoing marketing messages
        if tenant is not None and not tenant.marketing_opt_out:
            tenant.marketing_opt_out, tenant.marketing_opt_out_at = True, datetime.now(UTC)
            await db.flush()
    reopened = conv.status == "resolved"
    if reopened:
        conv.status, conv.resolved_at = "open", None
        await _sync_ticket_status(db, conv, "open")
    _touch(conv, text=body, incoming=True)
    hub.publish({"type": "conversation.new" if created else ("conversation.reopened" if reopened else "message.new"),
                 "conversation_id": str(conv.id), "channel": channel, "assigned_to": str(conv.assigned_to) if conv.assigned_to else None},
                assigned_to=conv.assigned_to)
    if conv.assigned_to:  # a customer reply is worth a direct nudge for whoever owns the conversation
        hub.publish({"type": "customer.replied", "conversation_id": str(conv.id)}, only_user=conv.assigned_to)
    return msg, conv, created


async def maybe_acknowledge(db: AsyncSession, conv: SupportConversation, *, automated: bool, sender) -> bool:
    """Automatic acknowledgement of a NEW conversation, subject to the configured automation. At most once per
    conversation, never to automated senders, and at most once per customer per 24h — so it cannot loop or spam."""
    cfg = await get_settings(db)
    if not cfg.auto_ack_enabled or automated or conv.ack_sent_at or conv.channel == "portal":
        return False
    key = conv.customer_email if conv.channel == "email" else conv.customer_phone
    if key:
        since = datetime.now(UTC) - timedelta(hours=24)
        col = SupportConversation.customer_email if conv.channel == "email" else SupportConversation.customer_phone
        recent = (await db.execute(select(func.count()).select_from(SupportConversation).where(
            col == key, SupportConversation.ack_sent_at.is_not(None), SupportConversation.ack_sent_at > since))).scalar_one()
        if recent:
            return False
    text = cfg.auto_ack_text if within_business_hours(cfg) else cfg.after_hours_text
    conv.ack_sent_at = datetime.now(UTC)  # set first: a failed send must not be retried into a loop
    ok = await sender(conv, text)
    if ok:
        db.add(SupportMessage(conversation_id=conv.id, direction="outgoing", sender_name="Pesaa Support (automatic)", body=text,
                              delivery_status="sent", meta={"automatic": True}))
    return ok


# ── outbound ───────────────────────────────────────────────────────────────────────────────────────────────

async def add_note(db: AsyncSession, user: User, conv: SupportConversation, body: str) -> SupportMessage:
    msg = SupportMessage(conversation_id=conv.id, direction="outgoing", is_internal_note=True, sender_name=user.full_name,
                         sender_user_id=user.id, body=body.strip(), delivery_status=None)
    db.add(msg)
    await db.flush()
    await record_audit(db, tenant_id=None, actor_user_id=user.id, actor_name=user.full_name, action="support.note",
                       entity_type="support_conversation", entity_id=str(conv.id), summary="Internal note added")
    await db.commit()
    hub.publish({"type": "message.new", "conversation_id": str(conv.id), "channel": conv.channel}, assigned_to=conv.assigned_to)
    return msg


async def record_outgoing(
    db: AsyncSession, user: User, conv: SupportConversation, body: str, attachments: list[dict] | None,
    *, delivery_status: str, provider: str | None, provider_message_id: str | None, error: str | None = None, meta: dict | None = None,
    client_request_id: uuid.UUID | None = None, next_attempt_at: datetime | None = None,
) -> SupportMessage:
    msg = SupportMessage(
        conversation_id=conv.id, direction="outgoing", sender_name=user.full_name, sender_user_id=user.id, body=body,
        attachments=attachments or None, provider=provider, provider_message_id=provider_message_id,
        delivery_status=delivery_status, delivery_error=error, meta=meta,
        client_request_id=client_request_id, next_attempt_at=next_attempt_at, send_attempts=0,
    )
    db.add(msg)
    _touch(conv, text=body or "(attachment)", incoming=False)
    conv.unread_count = 0
    if conv.first_response_at is None and delivery_status not in ("failed", "pending"):
        conv.first_response_at = datetime.now(UTC)
    if conv.assigned_to is None:  # replying claims an unassigned conversation, so two agents don't answer twice
        conv.assigned_to = user.id
    await record_audit(db, tenant_id=None, actor_user_id=user.id, actor_name=user.full_name, action="support.reply",
                       entity_type="support_conversation", entity_id=str(conv.id), summary=f"Replied via {conv.channel}",
                       changes={"status": delivery_status})
    await db.commit()
    hub.publish({"type": "message.new", "conversation_id": str(conv.id), "channel": conv.channel}, assigned_to=conv.assigned_to)
    return msg


async def update_delivery(db: AsyncSession, provider: str, provider_message_id: str, status: str, error: str | None = None) -> bool:
    """Delivery receipts only ever move a message forward (sent → delivered → read); `failed` is terminal."""
    order = {"pending": 0, "sent": 1, "delivered": 2, "read": 3}
    msg = (await db.execute(select(SupportMessage).where(
        SupportMessage.provider == provider, SupportMessage.provider_message_id == provider_message_id))).scalars().first()
    if msg is None or msg.direction != "outgoing":
        return False
    cur = msg.delivery_status or "pending"
    # failed only applies before the message has been delivered; once delivered/read it can't fail, and a failed one stays failed.
    allowed = cur in ("pending", "sent") if status == "failed" else order.get(status, -1) > order.get(cur, 0)
    if cur != "failed" and allowed:
        msg.delivery_status, msg.delivery_error = status, error if status == "failed" else None
        hub.publish({"type": "message.status", "conversation_id": str(msg.conversation_id)})
        return True
    return False


async def mark_read(db: AsyncSession, conv: SupportConversation) -> None:
    if conv.unread_count:
        conv.unread_count = 0
        await db.commit()


async def assign(db: AsyncSession, actor: User, conv: SupportConversation, user_id: uuid.UUID | None) -> SupportConversation:
    if not is_manager(actor) and conv.assigned_to not in (None, actor.id):
        raise ForbiddenError("This conversation is assigned to someone else")
    if user_id is not None:
        target = await db.get(User, user_id)
        if target is None or target.tenant_id is not None or target.role not in STAFF_ROLES or not target.is_active:
            raise ValidationError("That person isn't an active support team member")
        if not is_manager(actor) and user_id != actor.id:
            raise ForbiddenError("Agents can only assign conversations to themselves")
    elif not is_manager(actor) and conv.assigned_to not in (None, actor.id):
        raise ForbiddenError("Only a manager can reassign this conversation")
    conv.assigned_to = user_id
    await db.execute(
        SupportTicket.__table__.update().where(SupportTicket.conversation_id == conv.id, SupportTicket.status.in_(("open", "in_progress")))
        .values(assigned_to=user_id))
    await record_audit(db, tenant_id=None, actor_user_id=actor.id, actor_name=actor.full_name, action="support.assign",
                       entity_type="support_conversation", entity_id=str(conv.id), summary="Conversation assigned",
                       changes={"assigned_to": str(user_id) if user_id else None})
    await db.commit()
    event = {"type": "conversation.assigned", "conversation_id": str(conv.id), "channel": conv.channel}
    hub.publish(event, assigned_to=None)
    if user_id and user_id != actor.id:
        hub.publish({**event, "type": "ticket.assigned"}, only_user=user_id)
    return conv


async def set_conversation_status(db: AsyncSession, actor: User, conv: SupportConversation, status: str) -> SupportConversation:
    if status not in CONVERSATION_STATUSES:
        raise ValidationError("Status must be open or resolved")
    conv.status = status
    conv.resolved_at = datetime.now(UTC) if status == "resolved" else None
    await _sync_ticket_status(db, conv, "resolved" if status == "resolved" else "open")
    await record_audit(db, tenant_id=None, actor_user_id=actor.id, actor_name=actor.full_name, action=f"support.{status}",
                       entity_type="support_conversation", entity_id=str(conv.id), summary=f"Conversation marked {status}")
    await db.commit()
    hub.publish({"type": "conversation.status", "conversation_id": str(conv.id)}, assigned_to=conv.assigned_to)
    return conv


async def set_priority(db: AsyncSession, actor: User, conv: SupportConversation, priority: str) -> SupportConversation:
    if priority not in PRIORITIES:
        raise ValidationError("Priority must be low, normal, high or urgent")
    conv.priority = priority
    await db.execute(SupportTicket.__table__.update().where(SupportTicket.conversation_id == conv.id).values(priority=priority))
    await db.commit()
    return conv


# ── tickets ─────────────────────────────────────────────────────────────────────────────────────────────────

async def _sync_ticket_status(db: AsyncSession, conv: SupportConversation, status: str) -> None:
    """Conversation and ticket move together: resolving one resolves the other, a customer reply reopens both."""
    if status == "resolved":
        await db.execute(SupportTicket.__table__.update().where(
            SupportTicket.conversation_id == conv.id, SupportTicket.status.in_(("open", "in_progress")))
            .values(status="resolved", resolved_at=datetime.now(UTC)))
    else:
        await db.execute(SupportTicket.__table__.update().where(
            SupportTicket.conversation_id == conv.id, SupportTicket.status == "resolved").values(status="open", resolved_at=None))


async def ticket_for_conversation(db: AsyncSession, conversation_id: uuid.UUID) -> SupportTicket | None:
    return (await db.execute(select(SupportTicket).where(
        SupportTicket.conversation_id == conversation_id, SupportTicket.status != "closed").order_by(SupportTicket.created_at))).scalars().first()


async def create_ticket_from_conversation(db: AsyncSession, actor: User, conv: SupportConversation, priority: str | None = None) -> tuple[SupportTicket, bool]:
    """Idempotent: a conversation that already has an open ticket returns that ticket instead of a duplicate."""
    existing = await ticket_for_conversation(db, conv.id)
    if existing:
        return existing, False
    t = SupportTicket(
        tenant_id=conv.tenant_id, conversation_id=conv.id, subject=conv.subject or f"{conv.channel.title()} conversation with {conv.customer_name or conv.customer_phone or conv.customer_email or 'customer'}",
        status="open", priority=priority or conv.priority, assigned_to=conv.assigned_to or actor.id, created_by=actor.id,
    )
    db.add(t)
    await db.flush()
    await db.refresh(t)
    if conv.assigned_to is None:
        conv.assigned_to = actor.id
    await record_audit(db, tenant_id=conv.tenant_id, actor_user_id=actor.id, actor_name=actor.full_name, action="support.ticket.create",
                       entity_type="support_ticket", entity_id=str(t.id), summary=f"Ticket {t.reference} created from a conversation")
    await db.commit()
    return t, True


async def create_ticket(
    db: AsyncSession, *, subject: str, description: str, priority: str, tenant_id: uuid.UUID | None, requester: User | None,
    creator: User, customer_email: str | None = None, customer_name: str | None = None, from_portal: bool,
) -> SupportTicket:
    """A ticket always owns a conversation, so replies, notes and attachments work the same for every ticket."""
    if priority not in PRIORITIES:
        raise ValidationError("Priority must be low, normal, high or urgent")
    if tenant_id is not None and await db.get(Tenant, tenant_id) is None:
        raise NotFoundError("Business not found")
    conv = SupportConversation(
        channel="portal", external_thread_id=f"ticket-{uuid.uuid4().hex}", subject=subject,
        customer_name=(requester.full_name if requester else customer_name), customer_email=(requester.email if requester else customer_email),
        customer_phone=requester.phone if requester else None, tenant_id=tenant_id, status="open", priority=priority,
        meta={"origin": "tenant" if from_portal else "staff"},
    )
    db.add(conv)
    await db.flush()
    t = SupportTicket(tenant_id=tenant_id, conversation_id=conv.id, requester_user_id=requester.id if requester else None, subject=subject,
                      status="open", priority=priority, created_by=creator.id)
    db.add(t)
    await db.flush()
    await db.refresh(t)
    msg = SupportMessage(conversation_id=conv.id, direction="incoming" if from_portal else "outgoing", sender_name=creator.full_name,
                         sender_user_id=creator.id, body=description, delivery_status="delivered", is_internal_note=not from_portal)
    db.add(msg)
    _touch(conv, text=description, incoming=from_portal)
    await record_audit(db, tenant_id=tenant_id, actor_user_id=creator.id, actor_name=creator.full_name, action="support.ticket.create",
                       entity_type="support_ticket", entity_id=str(t.id), summary=f"Ticket {t.reference} created")
    await db.commit()
    hub.publish({"type": "conversation.new", "conversation_id": str(conv.id), "channel": "portal", "reference": t.reference})
    hub.publish({"type": "ticket.created", "ticket_id": str(t.id), "reference": t.reference, "priority": priority,
                 "conversation_id": str(conv.id)})
    if priority in ("high", "urgent"):
        hub.publish({"type": "ticket.urgent", "ticket_id": str(t.id), "reference": t.reference, "priority": priority})
    return t


async def update_ticket(db: AsyncSession, actor: User, ticket: SupportTicket, *, subject=None, status=None, priority=None,
                        assigned_to=None, unassign=False) -> SupportTicket:
    if not is_manager(actor) and ticket.assigned_to not in (None, actor.id):
        raise ForbiddenError("This ticket is assigned to someone else")
    conv = await db.get(SupportConversation, ticket.conversation_id)
    if subject:
        ticket.subject = subject
    if priority:
        if priority not in PRIORITIES:
            raise ValidationError("Priority must be low, normal, high or urgent")
        ticket.priority = priority
        if conv:
            conv.priority = priority
    if status:
        if status not in TICKET_STATUSES:
            raise ValidationError("Status must be open, in_progress, resolved or closed")
        ticket.status = status
        ticket.resolved_at = datetime.now(UTC) if status in ("resolved", "closed") else None
        if conv:
            conv.status = "resolved" if status in ("resolved", "closed") else "open"
            conv.resolved_at = ticket.resolved_at
    if unassign or assigned_to:
        if assigned_to:
            target = await db.get(User, assigned_to)
            if target is None or target.tenant_id is not None or target.role not in STAFF_ROLES or not target.is_active:
                raise ValidationError("That person isn't an active support team member")
            if not is_manager(actor) and assigned_to != actor.id:
                raise ForbiddenError("Agents can only assign tickets to themselves")
        ticket.assigned_to = None if unassign else assigned_to
        if conv:
            conv.assigned_to = ticket.assigned_to
    await record_audit(db, tenant_id=ticket.tenant_id, actor_user_id=actor.id, actor_name=actor.full_name, action="support.ticket.update",
                       entity_type="support_ticket", entity_id=str(ticket.id), summary=f"Ticket {ticket.reference} updated",
                       changes={k: v for k, v in {"status": status, "priority": priority, "assigned_to": str(assigned_to) if assigned_to else None}.items() if v})
    await db.commit()
    await db.refresh(ticket)
    if assigned_to and assigned_to != actor.id:
        hub.publish({"type": "ticket.assigned", "ticket_id": str(ticket.id), "reference": ticket.reference}, only_user=assigned_to)
    hub.publish({"type": "ticket.updated", "ticket_id": str(ticket.id)}, assigned_to=ticket.assigned_to)
    return ticket


async def tickets_to_reads(db: AsyncSession, rows: list[SupportTicket]) -> list[TicketRead]:
    users, tenants = await _names(db, {r.assigned_to for r in rows if r.assigned_to} | {r.requester_user_id for r in rows if r.requester_user_id},
                                  {r.tenant_id for r in rows if r.tenant_id})
    return [TicketRead.model_validate({
        "id": r.id, "reference": r.reference, "tenant_id": r.tenant_id, "tenant_name": tenants.get(r.tenant_id),
        "conversation_id": r.conversation_id, "requester_user_id": r.requester_user_id, "requester_name": users.get(r.requester_user_id),
        "subject": r.subject, "status": r.status, "priority": r.priority, "assigned_to": r.assigned_to, "assigned_name": users.get(r.assigned_to),
        "resolved_at": r.resolved_at, "created_at": r.created_at, "updated_at": r.updated_at}) for r in rows]


async def list_tickets(
    db: AsyncSession, user: User, *, status: str | None = None, priority: str | None = None, assigned: str | None = None,
    search: str | None = None, page: int = 1, page_size: int = 30,
) -> tuple[list[TicketRead], int]:
    stmt = select(SupportTicket)
    if not is_manager(user):
        stmt = stmt.where(or_(SupportTicket.assigned_to.is_(None), SupportTicket.assigned_to == user.id))
    if status in TICKET_STATUSES:
        stmt = stmt.where(SupportTicket.status == status)
    if priority in PRIORITIES:
        stmt = stmt.where(SupportTicket.priority == priority)
    if assigned == "mine":
        stmt = stmt.where(SupportTicket.assigned_to == user.id)
    elif assigned == "unassigned":
        stmt = stmt.where(SupportTicket.assigned_to.is_(None))
    if search:
        like = f"%{search.strip()}%"
        digits_only = re.sub(r"\D", "", search)
        cond = [SupportTicket.subject.ilike(like)]
        if digits_only:
            cond.append(SupportTicket.number == int(digits_only[:9]))
        stmt = stmt.where(or_(*cond))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(SupportTicket.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return await tickets_to_reads(db, list(rows)), total


# ── tenant-facing ────────────────────────────────────────────────────────────────────────────────────────────

async def get_my_ticket(db: AsyncSession, user: User, ticket_id: uuid.UUID) -> SupportTicket:
    """A business user can only ever load a ticket of THEIR business — anything else is a 404, not a 403, so ids of
    other tenants' tickets aren't even confirmed to exist."""
    t = await db.get(SupportTicket, ticket_id)
    if t is None or user.tenant_id is None or t.tenant_id != user.tenant_id:
        raise NotFoundError("Ticket not found")
    return t


async def my_tickets(db: AsyncSession, user: User, page: int, page_size: int) -> tuple[list[TicketRead], int]:
    if user.tenant_id is None:
        return [], 0
    stmt = select(SupportTicket).where(SupportTicket.tenant_id == user.tenant_id)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(SupportTicket.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return await tickets_to_reads(db, list(rows)), total


async def tenant_reply(db: AsyncSession, user: User, ticket: SupportTicket, body: str) -> SupportMessage:
    conv = await db.get(SupportConversation, ticket.conversation_id)
    if ticket.status == "closed":
        raise ValidationError("This ticket is closed. Open a new ticket for a new question.")
    msg = SupportMessage(conversation_id=conv.id, direction="incoming", sender_name=user.full_name, sender_user_id=user.id, body=body.strip(), delivery_status="delivered")
    db.add(msg)
    _touch(conv, text=body, incoming=True)
    if conv.status == "resolved":
        conv.status, conv.resolved_at = "open", None
        ticket.status, ticket.resolved_at = "open", None
    await db.commit()
    hub.publish({"type": "message.new", "conversation_id": str(conv.id), "channel": "portal"}, assigned_to=conv.assigned_to)
    if conv.assigned_to:
        hub.publish({"type": "customer.replied", "conversation_id": str(conv.id)}, only_user=conv.assigned_to)
    return msg


# ── team ────────────────────────────────────────────────────────────────────────────────────────────────────

async def list_staff(db: AsyncSession) -> list[StaffRead]:
    users = (await db.execute(select(User).where(User.tenant_id.is_(None), User.role.in_(STAFF_ROLES)).order_by(User.full_name))).scalars().all()
    conv_counts = dict((await db.execute(select(SupportConversation.assigned_to, func.count()).where(
        SupportConversation.status == "open", SupportConversation.assigned_to.is_not(None)).group_by(SupportConversation.assigned_to))).all())
    tick_counts = dict((await db.execute(select(SupportTicket.assigned_to, func.count()).where(
        SupportTicket.status.in_(("open", "in_progress")), SupportTicket.assigned_to.is_not(None)).group_by(SupportTicket.assigned_to))).all())
    return [StaffRead(id=u.id, email=u.email, full_name=u.full_name, role=u.role, is_active=u.is_active, last_login=u.last_login,
                      open_conversations=conv_counts.get(u.id, 0), open_tickets=tick_counts.get(u.id, 0)) for u in users]


async def create_staff(db: AsyncSession, actor: User, email: str, full_name: str, role: str) -> tuple[User, str]:
    if role not in (MANAGER, AGENT):
        raise ValidationError("Team members are Support Managers or Support Agents")
    if (await db.execute(select(User.id).where(func.lower(User.email) == email.lower(), User.tenant_id.is_(None)))).first():
        raise ConflictError("A platform user with this email already exists")
    temp = secrets.token_urlsafe(12)
    u = User(email=email, hashed_password=hash_password(temp), full_name=full_name, role=role, tenant_id=None, is_superuser=False, is_active=True)
    db.add(u)
    await db.flush()
    await record_audit(db, tenant_id=None, actor_user_id=actor.id, actor_name=actor.full_name, action="support.team.create",
                       entity_type="user", entity_id=str(u.id), summary=f"Support team member {email} added as {role}")
    await db.commit()
    return u, temp


async def update_staff(db: AsyncSession, actor: User, user_id: uuid.UUID, role: str | None, is_active: bool | None) -> User:
    u = await db.get(User, user_id)
    if u is None or u.tenant_id is not None or u.role not in STAFF_ROLES:
        raise NotFoundError("Team member not found")
    if u.role == SUPERADMIN:
        raise ForbiddenError("Super Admin accounts are managed elsewhere")
    if role is not None:
        if role not in (MANAGER, AGENT):
            raise ValidationError("Role must be support_manager or support_agent")
        u.role = role
    if is_active is not None:
        u.is_active = is_active
        if not is_active:  # their open work goes back to the queue
            await db.execute(SupportConversation.__table__.update().where(SupportConversation.assigned_to == u.id, SupportConversation.status == "open").values(assigned_to=None))
            await db.execute(SupportTicket.__table__.update().where(SupportTicket.assigned_to == u.id, SupportTicket.status.in_(("open", "in_progress"))).values(assigned_to=None))
    await record_audit(db, tenant_id=None, actor_user_id=actor.id, actor_name=actor.full_name, action="support.team.update",
                       entity_type="user", entity_id=str(u.id), summary=f"Support team member {u.email} updated",
                       changes={"role": role, "is_active": is_active})
    await db.commit()
    return u


# ── retention ──────────────────────────────────────────────────────────────────────────────────────────────

async def purge_old_conversations(db: AsyncSession) -> int:
    """Deletes RESOLVED conversations (and their messages, via cascade) whose last activity is older than the
    configured retention. Open conversations and anything linked to an unresolved ticket are never touched."""
    cfg = await get_settings(db)
    if not cfg.retention_days:
        return 0
    cutoff = datetime.now(UTC) - timedelta(days=cfg.retention_days)
    open_ticket_convs = select(SupportTicket.conversation_id).where(SupportTicket.status.in_(("open", "in_progress")))
    res = await db.execute(delete(SupportConversation).where(
        and_(SupportConversation.status == "resolved", SupportConversation.last_message_at < cutoff,
             SupportConversation.id.not_in(open_ticket_convs))))
    await db.commit()
    return res.rowcount or 0
