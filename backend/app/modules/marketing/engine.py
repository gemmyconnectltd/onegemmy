"""The one send engine. Campaigns, newsletter issues and automations all queue `marketing_sends` rows; this module turns
each row into an email through the shared SMTP sender (`app.core.email.send_email_message`) with retries, so there is a
single place that decides who may be emailed and how delivery is recorded.

A send is `sent` only when the mail server accepted it (that is what SMTP can tell us — not inbox delivery). Each row
is claimed with FOR UPDATE SKIP LOCKED, so two workers never send the same message, and the unique indexes on
(campaign, contact) / (automation, contact, key) mean a retry or a double click never creates a second message."""
import asyncio
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as env
from app.core.database import AsyncSessionLocal
from app.core.email import EmailDeliveryError, _resolve_smtp_credentials, send_email_message
from app.core.logging import get_logger
from app.modules.marketing import contacts as contacts_svc
from app.modules.marketing import settings as mkt_settings
from app.modules.marketing import tracking
from app.modules.marketing.models import (
    MarketingAutomation,
    MarketingCampaign,
    MarketingContact,
    MarketingSend,
)
from app.modules.marketing.render import personalize, render_email
from app.modules.tenants.models import Tenant

log = get_logger("marketing.engine")
MAX_ATTEMPTS = 5
BATCH = 20
PAUSE_BETWEEN = 0.25  # seconds — keeps us well under typical SMTP provider rate limits
STUCK_AFTER = timedelta(minutes=10)


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "campaign"


def campaign_slug(c: MarketingCampaign) -> str:
    return f"email-{slugify(c.name)}-{str(c.id)[:6]}"


def safe_mode() -> bool:
    return not env.is_production


def render_for(blocks: list[dict[str, Any]], *, subject: str, preheader: str | None, cfg: dict[str, dict[str, Any]]) -> tuple[str, str]:
    brand = {"color": cfg["brand"]["color"], "name": cfg["brand"]["company"], "logo_url": cfg["brand"]["logo_url"]}
    return render_email(blocks, subject=subject, preheader=preheader or "", brand=brand, company=cfg["brand"]["company"],
                        address=cfg["brand"]["address"], footer_note=cfg["compliance"]["footer_note"])


def from_header(cfg: dict[str, dict[str, Any]], campaign: MarketingCampaign | None) -> str:
    _, _, configured = _resolve_smtp_credentials("marketing")
    addr = re.search(r"<([^>]+)>", configured)
    email = (campaign.sender_email if campaign and campaign.sender_email else None) or cfg["general"]["sender_email"] or (addr.group(1) if addr else configured)
    name = (campaign.sender_name if campaign and campaign.sender_name else None) or cfg["general"]["sender_name"] or "Pesaa"
    return f"{name} <{email}>"


def values_for(contact: MarketingContact, tenant: Tenant | None, send_id: uuid.UUID) -> dict[str, str]:
    name = (contact.name or "").strip()
    first = name.split(" ")[0] if name else (contact.business_name or "there")
    return {"first_name": first, "name": name or first, "business_name": contact.business_name or "your business", "email": contact.email,
            "plan": (tenant.subscription_plan if tenant else "") or "", "country": contact.country or "",
            "unsubscribe_url": tracking.unsubscribe_url(contact.id, send_id)}


def _backoff(attempts: int) -> timedelta:
    return timedelta(minutes=min(5 * 2 ** max(attempts - 1, 0), 120))


async def _eligible(db: AsyncSession, contact_id: uuid.UUID, consent_mode: str, newsletter: bool) -> bool:
    return (await db.execute(contacts_svc.contact_select(MarketingContact.id).where(
        MarketingContact.id == contact_id, *contacts_svc.eligibility(consent_mode, newsletter=newsletter)))).first() is not None


async def process_send(db: AsyncSession, send: MarketingSend) -> str:
    """Delivers one claimed send and records the outcome. Returns its new status."""
    cfg = await mkt_settings.get_all(db)
    campaign = await db.get(MarketingCampaign, send.campaign_id) if send.campaign_id else None
    automation = await db.get(MarketingAutomation, send.automation_id) if send.automation_id else None
    source = campaign or automation
    contact = await db.get(MarketingContact, send.contact_id)
    now = datetime.now(UTC)

    def finish(status: str, reason: str | None = None, **extra: Any) -> str:
        send.status, send.reason, send.send_started_at = status, reason, None
        for k, v in extra.items():
            setattr(send, k, v)
        return status

    if source is None or contact is None:
        return finish("skipped", "The campaign or contact no longer exists")
    newsletter = bool(campaign and campaign.kind in ("newsletter", "issue"))
    if not await _eligible(db, contact.id, cfg["compliance"]["consent_mode"], newsletter):
        return finish("skipped", "No longer eligible (unsubscribed, suppressed or no consent)")
    if safe_mode() and contact.email not in contacts_svc.safe_recipients():
        return finish("skipped", "Safe mode: live sends outside production go only to MARKETING_TEST_RECIPIENTS")
    if not mkt_settings.outbound_configured():
        return finish("failed", "The email provider isn't configured on the server")

    tenant = await db.get(Tenant, contact.tenant_id) if contact.tenant_id else None
    html, text = render_for(source.blocks, subject=source.subject, preheader=source.preheader, cfg=cfg)
    values = values_for(contact, tenant, send.id)
    slug = campaign_slug(campaign) if campaign else f"auto-{slugify(automation.name)}"  # type: ignore[union-attr]
    body = tracking.instrument(personalize(html, values, html_mode=True), send.id, slug)
    plain = personalize(text, values, html_mode=False)
    subject = personalize(source.subject, values, html_mode=False)
    reply_to = (campaign.reply_to if campaign and campaign.reply_to else None) or cfg["general"]["reply_to"] or None
    unsub = values["unsubscribe_url"]
    headers = {"List-Unsubscribe": f"<{unsub}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click", "Precedence": "bulk", "X-Pesaa-Send": str(send.id)}
    send.attempts += 1
    try:
        mid = await send_email_message(contact.email, subject, body, plain, reply_to, "marketing", headers,
                                       from_header=from_header(cfg, campaign), raise_errors=True)
    except EmailDeliveryError as e:
        if e.rejected:  # the server permanently refused this address: a hard bounce — stop emailing it
            contact.status, contact.status_reason, contact.status_at = "bounced", "Mail server rejected the address", now
            return finish("bounced", "The mail server rejected this address")
        if e.uncertain:  # never auto-retry: the message may already have been delivered
            return finish("failed", "Delivery is uncertain — check before retrying")
        if e.retryable and send.attempts < MAX_ATTEMPTS:
            send.next_attempt_at = now + _backoff(send.attempts)
            return finish("pending", f"Temporary error — retrying (attempt {send.attempts})")
        return finish("failed", "The mail server did not accept the message")
    return finish("sent", None, message_id=mid, sent_at=datetime.now(UTC))


async def dispatch_due(limit: int = BATCH) -> int:
    """Claims due sends (campaign running / automation active) and delivers them. Returns how many were handled."""
    async with AsyncSessionLocal() as db:
        now = datetime.now(UTC)
        due = (await db.execute(
            select(MarketingSend).outerjoin(MarketingCampaign, MarketingCampaign.id == MarketingSend.campaign_id)
            .outerjoin(MarketingAutomation, MarketingAutomation.id == MarketingSend.automation_id)
            .where(MarketingSend.status == "pending", MarketingSend.next_attempt_at <= now,
                   or_(MarketingCampaign.status == "sending", MarketingAutomation.active.is_(True)))
            .order_by(MarketingSend.next_attempt_at).limit(limit).with_for_update(skip_locked=True, of=MarketingSend))).scalars().all()
        for s in due:
            s.status, s.send_started_at = "sending", now
        await db.commit()
        ids = [s.id for s in due]
    for sid in ids:
        async with AsyncSessionLocal() as db:
            send = await db.get(MarketingSend, sid, with_for_update=True)
            if send is None or send.status != "sending":
                continue
            try:
                await process_send(db, send)
            except Exception:  # never let one bad row stop the batch; it is retried once, then fails
                log.exception("marketing.send_error")
                send.status, send.reason = ("pending", "Unexpected error — retrying") if send.attempts < 2 else ("failed", "Unexpected error")
                send.next_attempt_at = datetime.now(UTC) + timedelta(minutes=2)
                send.send_started_at = None
            await db.commit()
        await asyncio.sleep(PAUSE_BETWEEN)
    return len(ids)


async def recover_stuck() -> None:
    """A send left `sending` by a crash may or may not have gone out — mark it failed rather than risk a duplicate."""
    async with AsyncSessionLocal() as db:
        await db.execute(update(MarketingSend).where(MarketingSend.status == "sending", MarketingSend.send_started_at < datetime.now(UTC) - STUCK_AFTER)
                         .values(status="failed", reason="Interrupted — check before retrying", send_started_at=None))
        await db.commit()


async def finish_campaigns() -> None:
    """Marks a running campaign as sent (or failed) once nothing is left to deliver."""
    async with AsyncSessionLocal() as db:
        running = (await db.execute(select(MarketingCampaign).where(MarketingCampaign.status == "sending"))).scalars().all()
        for c in running:
            open_ = (await db.execute(select(func.count()).select_from(MarketingSend).where(
                MarketingSend.campaign_id == c.id, MarketingSend.status.in_(("pending", "sending"))))).scalar_one()
            if open_:
                continue
            sent = (await db.execute(select(func.count()).select_from(MarketingSend).where(MarketingSend.campaign_id == c.id, MarketingSend.status == "sent"))).scalar_one()
            c.status, c.completed_at = ("sent" if sent else "failed"), datetime.now(UTC)
        await db.commit()


def snapshot_condition(campaign: MarketingCampaign, consent_mode: str) -> list[Any]:
    newsletter = campaign.kind in ("newsletter", "issue")
    return [*contacts_svc.filter_conditions(campaign.audience.get("filters") or {}), *contacts_svc.eligibility(consent_mode, newsletter=newsletter)]


async def enqueue_campaign(db: AsyncSession, campaign: MarketingCampaign, consent_mode: str) -> int:
    """Snapshots the eligible audience into the outbox (once per contact). Returns the number queued. Does not commit."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    await contacts_svc.sync_tenant_contacts(db)
    rows = (await db.execute(contacts_svc.contact_select(MarketingContact.id, MarketingContact.email).where(*snapshot_condition(campaign, consent_mode)))).all()
    now = datetime.now(UTC)
    for i in range(0, len(rows), 1000):
        await db.execute(pg_insert(MarketingSend).values([
            {"id": uuid.uuid4(), "campaign_id": campaign.id, "contact_id": cid, "email": email, "status": "pending", "next_attempt_at": now, "dedupe_key": ""}
            for cid, email in rows[i:i + 1000]]).on_conflict_do_nothing(index_elements=["campaign_id", "contact_id"], index_where=MarketingSend.campaign_id.isnot(None)))
    queued = (await db.execute(select(func.count()).select_from(MarketingSend).where(MarketingSend.campaign_id == campaign.id))).scalar_one()
    campaign.recipient_count = queued
    return queued


