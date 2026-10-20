"""Outreach: Pesaa staff starting a conversation with a business (email or WhatsApp), singly or in bulk.

Each business gets its OWN conversation — never one shared email — so its reply lands in the Support inbox like any
other and the usual delivery tracking, retries and send-once protection apply. Every outreach message is treated as
marketing: opted-out businesses are skipped, and each message carries an unsubscribe route (a signed link for email,
"reply STOP" for WhatsApp, honoured by `service.ingest_incoming`)."""
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.modules.audit.service import record_audit
from app.modules.support import messaging, openwa, service
from app.modules.tenants.models import Tenant, User

log = get_logger("support.outreach")
MAX_RECIPIENTS = 200
_KEY = settings.SECRET_KEY + ":marketing-unsubscribe"


def unsubscribe_token(tenant_id: uuid.UUID) -> str:
    return jwt.encode({"tid": str(tenant_id), "exp": datetime.now(UTC) + timedelta(days=730)}, _KEY, algorithm="HS256")


def tenant_from_token(token: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(jwt.decode(token, _KEY, algorithms=["HS256"])["tid"])
    except (JWTError, KeyError, ValueError):
        return None


def unsubscribe_url(tenant_id: uuid.UUID) -> str:
    return f"{settings.API_PUBLIC_URL.rstrip('/')}/api/v1/global/unsubscribe?token={unsubscribe_token(tenant_id)}"


@dataclass
class Result:
    tenant_id: str
    name: str
    status: str  # sent | queued | failed | skipped
    channel: str | None = None
    reason: str | None = None


async def _owner(db: AsyncSession, tenant_id: uuid.UUID) -> User | None:
    return (await db.execute(select(User).where(User.tenant_id == tenant_id, User.role == "owner", User.is_active.is_(True))
                             .order_by(User.created_at).limit(1))).scalars().first()


def _pick_channel(requested: str, tenant: Tenant, owner: User | None, wa_ready: bool) -> str:
    if requested == "preferred":
        return "whatsapp" if (tenant.preferred_contact == "whatsapp" and tenant.phone and wa_ready) else "email"
    return requested


async def send_one(db: AsyncSession, user: User, tenant: Tenant, *, channel: str, subject: str, body: str, request_id: uuid.UUID, wa_ready: bool) -> Result:
    res = Result(str(tenant.id), tenant.name, "skipped")
    if tenant.marketing_opt_out:
        res.reason = "Opted out of marketing"
        return res
    owner = await _owner(db, tenant.id)
    channel = _pick_channel(channel, tenant, owner, wa_ready)
    res.channel = channel
    per_tenant = uuid.uuid5(request_id, str(tenant.id))  # same request, same business → same message: a retry never doubles up
    if channel == "email":
        if not owner or not owner.email:
            res.reason = "No owner email"
            return res
        url = unsubscribe_url(tenant.id)
        text = f"{body}\n\n—\nYou receive this because {tenant.name} uses Pesaa. Unsubscribe: {url}"
        conv, _ = await service._get_or_create_conversation(
            db, "email", f"out:email:{per_tenant}", subject=subject, customer_name=owner.full_name, customer_email=owner.email.lower(),
            tenant_id=tenant.id, status="open", meta={"outbound": True, "unsubscribe_url": url})
    else:
        phone = tenant.phone or (owner.phone if owner else None)
        if not phone or len(service.digits(phone)) < 8:
            res.reason = "No phone number"
            return res
        if not wa_ready:
            res.reason = "WhatsApp isn't connected"
            return res
        text = f"{body}\n\nReply STOP to stop receiving these messages."
        conv, _ = await service._get_or_create_conversation(
            db, "whatsapp", f"{service.digits(phone)}@c.us", subject=None, customer_name=owner.full_name if owner else tenant.name,
            customer_phone=phone, tenant_id=tenant.id, status="open", meta={"outbound": True})
    msg = await messaging.send_reply(db, user, conv, text, [], per_tenant)
    res.status = {"failed": "failed", "pending": "queued"}.get(msg.delivery_status or "", "sent")
    res.reason = msg.delivery_error if res.status == "failed" else None
    return res


async def send_outreach(db: AsyncSession, user: User, tenant_ids: list[uuid.UUID], *, channel: str, subject: str, body: str, request_id: uuid.UUID) -> list[Result]:
    if not tenant_ids or len(set(tenant_ids)) > MAX_RECIPIENTS:
        raise ValidationError(f"Choose between 1 and {MAX_RECIPIENTS} businesses")
    if channel not in ("email", "whatsapp", "preferred"):
        raise ValidationError("Unknown channel")
    body = body.strip()
    if not body:
        raise ValidationError("Write a message")
    if channel != "whatsapp" and not subject.strip():
        raise ValidationError("An email needs a subject")
    wa_ready = openwa.configured() and (await openwa.get_channel(db)).status == "connected"
    tenants = {t.id: t for t in (await db.execute(select(Tenant).where(Tenant.id.in_(set(tenant_ids)), Tenant.archived_at.is_(None)))).scalars().all()}
    results: list[Result] = []
    for tid in dict.fromkeys(tenant_ids):
        tenant = tenants.get(tid)
        if tenant is None:
            results.append(Result(str(tid), "Unknown business", "skipped", reason="Business not found"))
            continue
        try:
            results.append(await send_one(db, user, tenant, channel=channel, subject=subject.strip(), body=body, request_id=request_id, wa_ready=wa_ready))
        except ValidationError as e:
            results.append(Result(str(tid), tenant.name, "failed", reason=str(getattr(e, "detail", None) or e)[:200]))
    summary = {k: sum(1 for r in results if r.status == k) for k in ("sent", "queued", "failed", "skipped")}
    await record_audit(db, tenant_id=None, actor_user_id=user.id, actor_name=user.full_name, action="support.outreach",
                       entity_type="support_outreach", entity_id=str(request_id), summary=f"Outreach to {len(results)} businesses via {channel}", changes=summary)
    await db.commit()
    return results


async def opt_out(db: AsyncSession, tenant_id: uuid.UUID) -> bool:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        return False
    if not tenant.marketing_opt_out:
        tenant.marketing_opt_out, tenant.marketing_opt_out_at = True, datetime.now(UTC)
        await db.commit()
    return True
