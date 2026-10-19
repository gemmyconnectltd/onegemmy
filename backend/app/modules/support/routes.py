import asyncio
import email.utils
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.email import EmailDeliveryError
from app.core.exceptions import AppError, ForbiddenError, NotFoundError, ValidationError
from app.core.pagination import PageQuery
from app.core.rate_limit import rate_limit
from app.core.response import paginated_response, success_response
from app.modules.support import email_inbound, hub, messaging, openwa, service
from app.modules.support.deps import (
    STAFF_ROLES,
    SupportManager,
    SupportStaff,
    SupportSuperAdmin,
    is_manager,
)
from app.modules.support.models import (
    SupportChannel,
    SupportConversation,
    SupportMessage,
    SupportTicket,
)
from app.modules.support.schemas import (
    AssignIn,
    NoteIn,
    PriorityIn,
    ReplyIn,
    StaffCreateIn,
    StaffUpdateIn,
    StatusIn,
    SupportSettingsIO,
    TicketCreateIn,
    TicketUpdateIn,
)

router = APIRouter(prefix="/support", tags=["Support"])


def _dump(model) -> dict:
    return model.model_dump(mode="json")


# ═══ staff: conversations ═════════════════════════════════════════════════════════════════════════════════════

@router.get("/summary")
async def summary(db: DbSession, user: SupportStaff):
    base = service._scope(select(SupportConversation), user).where(SupportConversation.status == "open").subquery()
    unread = (await db.execute(select(func.coalesce(func.sum(base.c.unread_count), 0)))).scalar_one()
    unassigned = (await db.execute(select(func.count()).select_from(base).where(base.c.assigned_to.is_(None)))).scalar_one()
    mine = (await db.execute(select(func.count()).select_from(base).where(base.c.assigned_to == user.id))).scalar_one()
    wa = await openwa.get_channel(db) if openwa.configured() else None
    return success_response(data={"unread": int(unread), "unassigned": unassigned, "mine": mine,
                                  "whatsapp_status": wa.status if wa else "not_configured"})


@router.get("/conversations")
async def list_conversations(
    db: DbSession, user: SupportStaff, page_params: PageQuery, view: str = Query("all"), channel: str | None = None,
    search: str | None = Query(None, max_length=120),
):
    items, total = await service.list_conversations(db, user, view=view, channel=channel, search=search, page=page_params.page, page_size=page_params.page_size)
    return paginated_response(items=[_dump(i) for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Conversations retrieved")


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: uuid.UUID, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    return success_response(data=_dump((await service.to_conversation_reads(db, [conv]))[0]), message="Conversation retrieved")


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: uuid.UUID, db: DbSession, user: SupportStaff, before: datetime | None = None, limit: int = Query(50, ge=1, le=100)):
    await service.get_conversation(db, user, conversation_id)
    items, has_more = await service.list_messages(db, conversation_id, before=before, limit=limit)
    return success_response(data={"items": [_dump(i) for i in items], "has_more": has_more}, message="Messages retrieved")


@router.get("/conversations/{conversation_id}/related")
async def related(conversation_id: uuid.UUID, db: DbSession, user: SupportStaff):
    """Right-hand customer panel: previous conversations with the same person and their tickets."""
    conv = await service.get_conversation(db, user, conversation_id)
    cond = []
    if conv.customer_email:
        cond.append(SupportConversation.customer_email == conv.customer_email)
    if conv.customer_phone:
        cond.append(SupportConversation.customer_phone == conv.customer_phone)
    previous = []
    if cond:
        from sqlalchemy import or_
        rows = (await db.execute(service._scope(select(SupportConversation), user).where(or_(*cond), SupportConversation.id != conv.id)
                                 .order_by(SupportConversation.created_at.desc()).limit(10))).scalars().all()
        previous = await service.to_conversation_reads(db, list(rows))
    tickets = []
    if conv.tenant_id:
        rows = (await db.execute(select(SupportTicket).where(SupportTicket.tenant_id == conv.tenant_id).order_by(SupportTicket.created_at.desc()).limit(10))).scalars().all()
        tickets = await service.tickets_to_reads(db, list(rows))
    return success_response(data={"previous": [_dump(p) for p in previous], "tickets": [_dump(t) for t in tickets]}, message="Related items retrieved")


@router.post("/conversations/{conversation_id}/reply", dependencies=[Depends(rate_limit("support-reply", 90, 60))])
async def reply(conversation_id: uuid.UUID, data: ReplyIn, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    msg = await messaging.send_reply(db, user, conv, data.body, data.attachment_ids, data.client_request_id)
    return success_response(data=_dump(service.message_to_read(msg)), message="Reply could not be delivered" if msg.delivery_status == "failed" else ("Reply queued" if msg.delivery_status == "pending" else "Reply sent"), status_code=201)


@router.post("/conversations/{conversation_id}/messages/{message_id}/retry")
async def retry(conversation_id: uuid.UUID, message_id: uuid.UUID, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    msg = await db.get(SupportMessage, message_id)
    if msg is None or msg.conversation_id != conv.id:
        raise NotFoundError("Message not found")
    sent = await messaging.retry_failed(db, user, conv, msg)
    return success_response(data=_dump(service.message_to_read(sent)), message="Message re-sent", status_code=201)


@router.post("/conversations/{conversation_id}/notes", status_code=201)
async def add_note(conversation_id: uuid.UUID, data: NoteIn, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    msg = await service.add_note(db, user, conv, data.body)
    return success_response(data=_dump(service.message_to_read(msg)), message="Note added", status_code=201)


@router.post("/conversations/{conversation_id}/assign")
async def assign(conversation_id: uuid.UUID, data: AssignIn, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    conv = await service.assign(db, user, conv, data.user_id)
    return success_response(data=_dump((await service.to_conversation_reads(db, [conv]))[0]), message="Conversation assigned")


@router.post("/conversations/{conversation_id}/status")
async def set_status(conversation_id: uuid.UUID, data: StatusIn, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    conv = await service.set_conversation_status(db, user, conv, data.status)
    return success_response(data=_dump((await service.to_conversation_reads(db, [conv]))[0]), message="Status updated")


@router.post("/conversations/{conversation_id}/priority")
async def set_priority(conversation_id: uuid.UUID, data: PriorityIn, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    conv = await service.set_priority(db, user, conv, data.priority)
    return success_response(data=_dump((await service.to_conversation_reads(db, [conv]))[0]), message="Priority updated")


@router.post("/conversations/{conversation_id}/read")
async def mark_read(conversation_id: uuid.UUID, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    await service.mark_read(db, conv)
    return success_response(message="Marked as read")


@router.post("/conversations/{conversation_id}/ticket")
async def convert_to_ticket(conversation_id: uuid.UUID, db: DbSession, user: SupportStaff):
    conv = await service.get_conversation(db, user, conversation_id)
    ticket, created = await service.create_ticket_from_conversation(db, user, conv)
    return success_response(data=_dump((await service.tickets_to_reads(db, [ticket]))[0]), message="Ticket created" if created else "This conversation already has an open ticket", status_code=201 if created else 200)


@router.post("/uploads", status_code=201, dependencies=[Depends(rate_limit("support-upload", 60, 60))])
async def upload(user: SupportStaff, file: UploadFile = File(...)):
    data = await file.read(service.MAX_ATTACHMENT_BYTES + 1)
    meta = service.save_attachment(data, file.filename or "file", file.content_type)
    return success_response(data={"token": messaging.stage_token(meta, user), "name": meta["name"], "mime": meta["mime"], "size": meta["size"]}, message="Uploaded", status_code=201)


@router.get("/attachments/{message_id}/{attachment_id}")
async def download_attachment(message_id: uuid.UUID, attachment_id: str, db: DbSession, user: CurrentUser):
    """Staff can open attachments of conversations they may see; a business user only attachments on THEIR OWN tickets."""
    msg = await db.get(SupportMessage, message_id)
    if msg is None:
        raise NotFoundError("Attachment not found")
    conv = await db.get(SupportConversation, msg.conversation_id)
    if user.tenant_id is None:
        if user.role not in STAFF_ROLES or not user.is_active:
            raise ForbiddenError("Support staff access required")
        await service.get_conversation(db, user, conv.id)  # raises for someone else's assigned conversation
    elif conv.tenant_id != user.tenant_id or msg.is_internal_note or conv.channel != "portal":
        raise NotFoundError("Attachment not found")
    att = next((a for a in (msg.attachments or []) if a["id"] == attachment_id), None)
    if att is None:
        raise NotFoundError("Attachment not found")
    return FileResponse(service.attachment_file(att), media_type=att.get("mime"), filename=att["name"],
                        content_disposition_type="attachment", headers={"X-Content-Type-Options": "nosniff"})


# ═══ staff: tickets ═══════════════════════════════════════════════════════════════════════════════════════════

@router.get("/tickets")
async def list_tickets(db: DbSession, user: SupportStaff, page_params: PageQuery, status: str | None = None, priority: str | None = None,
                       assigned: str | None = None, search: str | None = Query(None, max_length=120)):
    items, total = await service.list_tickets(db, user, status=status, priority=priority, assigned=assigned, search=search, page=page_params.page, page_size=page_params.page_size)
    return paginated_response(items=[_dump(i) for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Tickets retrieved")


@router.post("/tickets", status_code=201)
async def create_ticket(data: TicketCreateIn, db: DbSession, user: SupportStaff):
    t = await service.create_ticket(db, subject=data.subject, description=data.description, priority=data.priority, tenant_id=data.tenant_id, requester=None,
                                    creator=user, customer_email=data.customer_email, customer_name=data.customer_name, from_portal=False)
    return success_response(data=_dump((await service.tickets_to_reads(db, [t]))[0]), message="Ticket created", status_code=201)


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: uuid.UUID, db: DbSession, user: SupportStaff):
    t = await db.get(SupportTicket, ticket_id)
    if t is None:
        raise NotFoundError("Ticket not found")
    if not is_manager(user) and t.assigned_to not in (None, user.id):
        raise ForbiddenError("This ticket is assigned to someone else")
    return success_response(data=_dump((await service.tickets_to_reads(db, [t]))[0]), message="Ticket retrieved")


@router.patch("/tickets/{ticket_id}")
async def update_ticket(ticket_id: uuid.UUID, data: TicketUpdateIn, db: DbSession, user: SupportStaff):
    t = await db.get(SupportTicket, ticket_id)
    if t is None:
        raise NotFoundError("Ticket not found")
    t = await service.update_ticket(db, user, t, subject=data.subject, status=data.status, priority=data.priority, assigned_to=data.assigned_to, unassign=data.unassign)
    return success_response(data=_dump((await service.tickets_to_reads(db, [t]))[0]), message="Ticket updated")


# ═══ staff: team, settings, channels ══════════════════════════════════════════════════════════════════════════

@router.get("/team")
async def team(db: DbSession, user: SupportStaff):
    return success_response(data=[_dump(s) for s in await service.list_staff(db)], message="Team retrieved")


@router.post("/team", status_code=201)
async def add_member(data: StaffCreateIn, db: DbSession, user: SupportSuperAdmin):
    u, temp = await service.create_staff(db, user, str(data.email), data.full_name, data.role)
    # Shown once so the Super Admin can hand it over; the person should change it at first sign-in.
    return success_response(data={"id": str(u.id), "email": u.email, "role": u.role, "temp_password": temp}, message="Team member added", status_code=201)


@router.patch("/team/{user_id}")
async def update_member(user_id: uuid.UUID, data: StaffUpdateIn, db: DbSession, user: SupportSuperAdmin):
    u = await service.update_staff(db, user, user_id, data.role, data.is_active)
    return success_response(data={"id": str(u.id), "role": u.role, "is_active": u.is_active}, message="Team member updated")


@router.get("/settings")
async def get_settings(db: DbSession, user: SupportStaff):
    return success_response(data=_dump(await service.get_settings(db)), message="Settings retrieved")


@router.put("/settings")
async def put_settings(data: SupportSettingsIO, db: DbSession, user: SupportSuperAdmin):
    return success_response(data=_dump(await service.save_settings(db, data, user)), message="Settings saved")


@router.get("/channels")
async def channels(db: DbSession, user: SupportStaff):
    """Channel status for the Settings page. Only non-secret state — never keys, tokens or session data."""
    wa = await openwa.refresh_status(db) if openwa.configured() else None
    mail = (await db.execute(select(SupportChannel).where(SupportChannel.kind == "email"))).scalars().first()
    return success_response(data={
        "whatsapp": {"configured": openwa.configured(), "status": wa.status if wa else "not_configured", "number": wa.identity if wa else None,
                     "last_connected_at": wa.last_connected_at.isoformat() if wa and wa.last_connected_at else None, "last_error": wa.last_error if wa else None},
        "email": {"outbound_configured": email_inbound.outbound_configured(), "inbound_configured": email_inbound.configured(),
                  "mailbox": settings.SUPPORT_MAILBOX or None, "sender_name": settings.SUPPORT_SENDER_NAME, "reply_address": email.utils.parseaddr(email_inbound.from_header())[1] or None, "status": mail.status if mail else ("not_configured" if not email_inbound.configured() else "connecting"),
                  "last_connected_at": mail.last_connected_at.isoformat() if mail and mail.last_connected_at else None, "last_error": mail.last_error if mail else None},
    }, message="Channels retrieved")


@router.post("/channels/whatsapp/connect")
async def whatsapp_connect(db: DbSession, user: SupportSuperAdmin):
    try:
        ch = await openwa.connect(db)
    except openwa.OpenWAError as e:
        raise ValidationError(str(e)) from e
    return success_response(data={"status": ch.status}, message="Connection started")


@router.get("/channels/whatsapp/qr")
async def whatsapp_qr(db: DbSession, user: SupportSuperAdmin):
    try:
        qr = await openwa.get_qr(db)
        ch = await openwa.refresh_status(db)
    except openwa.OpenWAError as e:
        raise ValidationError(str(e)) from e
    return success_response(data={**qr, "status": ch.status}, message="QR retrieved")


@router.post("/channels/whatsapp/disconnect")
async def whatsapp_disconnect(db: DbSession, user: SupportSuperAdmin):
    ch = await openwa.disconnect(db)
    return success_response(data={"status": ch.status}, message="WhatsApp disconnected")


@router.post("/channels/email/sync")
async def email_sync(db: DbSession, user: SupportManager):
    if not email_inbound.configured():
        raise ValidationError("Inbound email isn't configured on the server (Microsoft Graph credentials are missing).")
    return success_response(data={"imported": await email_inbound.sync_mailbox(db)}, message="Mailbox synced")


class TestEmailIn(BaseModel):
    to: EmailStr | None = None  # defaults to the signed-in admin's own address


@router.post("/channels/email/test-connection", dependencies=[Depends(rate_limit("support-email-test", 10, 60))])
async def email_test_connection(user: SupportSuperAdmin):
    """Signs in to SMTP and Graph without sending anything. Reports ok/error per direction — never credentials."""
    return success_response(data=await email_inbound.test_connection(), message="Connection checked")


@router.post("/channels/email/test-send", dependencies=[Depends(rate_limit("support-email-test", 10, 60))])
async def email_test_send(data: TestEmailIn, user: SupportSuperAdmin):
    to = str(data.to or user.email)
    try:
        message_id = await email_inbound.send_test_email(to)
    except EmailDeliveryError as e:
        raise ValidationError(str(e)) from e
    return success_response(data={"to": to, "message_id": message_id}, message="Test email accepted by the mail server")


@router.post("/maintenance/purge")
async def purge(db: DbSession, user: SupportSuperAdmin):
    return success_response(data={"deleted": await service.purge_old_conversations(db)}, message="Old conversations purged")


@router.get("/stream")
async def stream(request: Request, user: SupportStaff):
    """Server-Sent Events: instant 'something changed' nudges for the open inbox (no polling)."""
    sub = hub.subscribe(user.id, user.role)

    async def gen():
        try:
            yield "retry: 5000\n\n"
            while not await request.is_disconnected():
                try:
                    event = await asyncio.wait_for(sub.queue.get(), timeout=20)
                    yield f"data: {json.dumps(event)}\n\n"
                except TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            hub.unsubscribe(sub)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ═══ OpenWA webhook (no user auth: protected by HMAC signature + idempotency) ═══════════════════════════════════

@router.post("/webhooks/openwa", dependencies=[Depends(rate_limit("support-webhook", 1200, 60))])
async def openwa_webhook(request: Request, db: DbSession):
    raw = await request.body()
    if len(raw) > 2_000_000:
        raise AppError("Payload too large")
    if not openwa.verify_signature(raw, request.headers.get("x-openwa-signature")):
        raise ForbiddenError("Invalid signature")  # checked before the body is parsed or stored
    try:
        payload = json.loads(raw)
    except ValueError as e:
        raise ValidationError("Invalid JSON") from e
    delivery = request.headers.get("x-openwa-delivery-id") or request.headers.get("x-openwa-idempotency-key")
    event_name = request.headers.get("x-openwa-event")
    if delivery and not await openwa.record_webhook_delivery(db, delivery, event_name):
        return Response(status_code=200, content=json.dumps({"duplicate": True}), media_type="application/json")
    ev = openwa.parse_webhook(event_name, payload if isinstance(payload, dict) else {})
    if ev is not None:
        await openwa.handle_event(db, ev)  # an error here rolls back the delivery record too, so OpenWA's retry reprocesses
    await db.commit()
    return {"ok": True}


# ═══ tenant: Help & Support (a business sees only ITS OWN tickets) ═════════════════════════════════════════════

def _require_business(user) -> None:
    if user.tenant_id is None:
        raise ForbiddenError("Help & Support is for business accounts")


@router.get("/my/tickets")
async def my_tickets(db: DbSession, user: CurrentUser, page_params: PageQuery):
    _require_business(user)
    items, total = await service.my_tickets(db, user, page_params.page, page_params.page_size)
    return paginated_response(items=[_dump(i) for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Your tickets")


@router.post("/my/tickets", status_code=201, dependencies=[Depends(rate_limit("support-my-ticket", 20, 3600))])
async def my_create_ticket(data: TicketCreateIn, db: DbSession, user: CurrentUser):
    _require_business(user)
    t = await service.create_ticket(db, subject=data.subject, description=data.description, priority="normal" if data.priority not in ("low", "normal") else data.priority,
                                    tenant_id=user.tenant_id, requester=user, creator=user, from_portal=True)
    return success_response(data=_dump((await service.tickets_to_reads(db, [t]))[0]), message="Ticket created", status_code=201)


@router.get("/my/tickets/{ticket_id}")
async def my_ticket(ticket_id: uuid.UUID, db: DbSession, user: CurrentUser):
    _require_business(user)
    t = await service.get_my_ticket(db, user, ticket_id)
    msgs, _ = await service.list_messages(db, t.conversation_id, limit=100, include_internal=False)
    return success_response(data={"ticket": _dump((await service.tickets_to_reads(db, [t]))[0]), "messages": [_dump(m) for m in msgs]}, message="Ticket retrieved")


@router.post("/my/tickets/{ticket_id}/reply", status_code=201, dependencies=[Depends(rate_limit("support-my-reply", 60, 3600))])
async def my_reply(ticket_id: uuid.UUID, data: NoteIn, db: DbSession, user: CurrentUser):
    _require_business(user)
    t = await service.get_my_ticket(db, user, ticket_id)
    msg = await service.tenant_reply(db, user, t, data.body)
    return success_response(data=_dump(service.message_to_read(msg)), message="Reply sent", status_code=201)
