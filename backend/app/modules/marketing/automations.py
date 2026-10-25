"""Marketing automations: emails sent when something really happens to a business. Every trigger is computed from data
the platform already records — no event is invented — and an automation only ever acts on events AFTER it was
activated, so switching one on never mails the whole back-catalogue.

Triggers
- signup: a business registered (tenants.created_at) + a delay.
- no_sale_after_signup: N days after registering with no Completed sale (the same "activated" definition as Website Traffic).
- renewal_due: an active subscription's period ends within N days (once per billing period).
- inactive: a business that used the ERP before but has had no activity for N days (at most once every 90 days).
- manual: an announcement that goes out when an admin presses Run (once per contact)."""
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import String, exists, func, literal, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.billing.models import BillingSubscription
from app.modules.marketing import contacts as contacts_svc
from app.modules.marketing import settings as mkt_settings
from app.modules.marketing.models import (
    MarketingAutomation,
    MarketingContact,
    MarketingSend,
    MarketingTemplate,
)
from app.modules.marketing.render import blocks_text, clean_blocks, unknown_variables
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant
from app.modules.traffic.models import ErpActivity

KINDS: dict[str, dict[str, Any]] = {
    "welcome": {"trigger": "signup", "label": "Welcome series", "params": {}},
    "onboarding": {"trigger": "no_sale_after_signup", "label": "Onboarding follow-up", "params": {"days": 3}},
    "renewal": {"trigger": "renewal_due", "label": "Renewal reminder", "params": {"days_before": 7}},
    "reengagement": {"trigger": "inactive", "label": "Re-engagement", "params": {"inactive_days": 30}},
    "announcement": {"trigger": "manual", "label": "Product announcement", "params": {}},
}
BATCH = 500


def describe_trigger(a: MarketingAutomation) -> str:
    p = a.params or {}
    return {
        "signup": f"{a.delay_hours}h after a business signs up" if a.delay_hours else "When a business signs up",
        "no_sale_after_signup": f"{p.get('days', 3)} days after signup with no completed sale",
        "renewal_due": f"{p.get('days_before', 7)} days before a subscription renews",
        "inactive": f"No ERP activity for {p.get('inactive_days', 30)} days",
        "manual": "When you press Run",
    }[a.trigger]


def _clean(data: dict[str, Any], kind: str | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if "name" in data:
        out["name"] = str(data["name"] or "").strip()[:160]
        if not out["name"]:
            raise ValidationError("Give the automation a name")
    for k, n in (("subject", 300), ("preheader", 200)):
        if k in data:
            out[k] = str(data[k] or "").strip()[:n] or ("" if k == "subject" else None)
    if "blocks" in data:
        out["blocks"] = clean_blocks(data["blocks"])
    if "delay_hours" in data:
        out["delay_hours"] = min(max(int(data["delay_hours"] or 0), 0), 24 * 30)
    if "params" in data:
        p = data["params"] or {}
        out["params"] = {k: min(max(int(p[k]), 1), 365) for k in ("days", "days_before", "inactive_days") if k in p}
    if "template_id" in data:
        out["template_id"] = uuid.UUID(str(data["template_id"])) if data["template_id"] else None
    if bad := unknown_variables(out.get("subject") or "", out.get("preheader") or "", blocks_text(out.get("blocks", []))):
        raise ValidationError("Unknown variable: " + ", ".join("{{" + b + "}}" for b in bad))
    return out


async def get(db: AsyncSession, automation_id: uuid.UUID, *, lock: bool = False) -> MarketingAutomation:
    a = await db.get(MarketingAutomation, automation_id, with_for_update=lock)
    if a is None:
        raise NotFoundError("Automation not found")
    return a


async def create(db: AsyncSession, user_id: uuid.UUID, kind: str, data: dict[str, Any]) -> MarketingAutomation:
    if kind not in KINDS:
        raise ValidationError("Unknown automation type")
    values = _clean({"name": KINDS[kind]["label"], **data})
    if values.get("template_id") and not values.get("blocks"):
        t = await db.get(MarketingTemplate, values["template_id"])
        if t is None:
            raise ValidationError("That template no longer exists")
        values["blocks"] = t.blocks
        values.setdefault("subject", t.subject or "")
        values.setdefault("preheader", t.preheader)
    a = MarketingAutomation(kind=kind, trigger=KINDS[kind]["trigger"], created_by=user_id, active=False,
                            **{"params": KINDS[kind]["params"], "blocks": [], **values})
    db.add(a)
    await db.flush()
    return a


async def update(db: AsyncSession, automation_id: uuid.UUID, data: dict[str, Any]) -> MarketingAutomation:
    a = await get(db, automation_id, lock=True)
    for k, v in _clean(data).items():
        setattr(a, k, v)
    await db.flush()
    return a


async def set_active(db: AsyncSession, automation_id: uuid.UUID, active: bool) -> MarketingAutomation:
    a = await get(db, automation_id, lock=True)
    if active:
        if not a.subject.strip() or not a.blocks:
            raise ValidationError("Add a subject and content before activating")
        if not mkt_settings.outbound_configured():
            raise ValidationError("No email provider is configured on the server")
        a.activated_at = datetime.now(UTC)  # only events from now on count
    a.active = active
    await db.flush()
    return a


def _candidates(a: MarketingAutomation, now: datetime) -> tuple[Any, Any]:
    """(select of (contact id, email, dedupe_key), extra eligibility) for events since activation."""
    since = a.activated_at or now
    p = a.params or {}
    cols = [MarketingContact.id, MarketingContact.email]
    base = contacts_svc.contact_select
    if a.trigger == "signup":
        return base(*cols, literal("", type_=String).label("k")).where(Tenant.created_at >= since, Tenant.created_at + timedelta(hours=a.delay_hours) <= now), None
    if a.trigger == "no_sale_after_signup":
        days = timedelta(days=p.get("days", 3))
        sold = exists().where(Order.tenant_id == Tenant.id, Order.status == "Completed")
        return base(*cols, literal("", type_=String).label("k")).where(Tenant.created_at >= since, Tenant.created_at + days <= now, ~sold), None
    if a.trigger == "renewal_due":
        due = now + timedelta(days=p.get("days_before", 7))
        sub = select(BillingSubscription.tenant_id, BillingSubscription.period_end).where(
            BillingSubscription.status == "active", BillingSubscription.period_end > now, BillingSubscription.period_end <= due,
            BillingSubscription.cancel_at_end.is_(False)).subquery()
        return (base(*cols, func.to_char(sub.c.period_end, "YYYY-MM-DD").label("k")).join(sub, sub.c.tenant_id == Tenant.id)), None
    if a.trigger == "inactive":
        cutoff = now - timedelta(days=p.get("inactive_days", 30))
        last = select(ErpActivity.tenant_id, func.max(ErpActivity.created_at).label("last")).group_by(ErpActivity.tenant_id).subquery()
        return (base(*cols, literal(str((now - datetime(1970, 1, 1, tzinfo=UTC)).days // 90), type_=String).label("k"))
                .join(last, last.c.tenant_id == Tenant.id).where(last.c.last < cutoff)), None
    return base(*cols, literal("", type_=String).label("k")), None  # manual


async def enqueue(db: AsyncSession, a: MarketingAutomation, *, limit: int = BATCH) -> int:
    """Queues sends for newly eligible contacts (once per contact/key). Returns how many were added. Does not commit."""
    cfg = await mkt_settings.get_section(db, "compliance")
    now = datetime.now(UTC)
    stmt, _ = _candidates(a, now)
    rows = (await db.execute(stmt.where(*contacts_svc.eligibility(cfg["consent_mode"])).limit(limit))).all()
    if not rows:
        return 0
    before = (await db.execute(select(func.count()).select_from(MarketingSend).where(MarketingSend.automation_id == a.id))).scalar_one()
    await db.execute(pg_insert(MarketingSend).values([
        {"id": uuid.uuid4(), "automation_id": a.id, "contact_id": cid, "email": email, "status": "pending", "next_attempt_at": now, "dedupe_key": key or ""}
        for cid, email, key in rows]).on_conflict_do_nothing(index_elements=["automation_id", "contact_id", "dedupe_key"], index_where=MarketingSend.automation_id.isnot(None)))
    after = (await db.execute(select(func.count()).select_from(MarketingSend).where(MarketingSend.automation_id == a.id))).scalar_one()
    a.last_run_at = now
    return after - before


async def stats(db: AsyncSession, automation_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
    rows = (await db.execute(select(
        MarketingSend.automation_id, func.count(), func.count().filter(MarketingSend.status == "sent"), func.count().filter(MarketingSend.status.in_(("pending", "sending"))),
        func.count().filter(MarketingSend.status.in_(("failed", "bounced"))), func.count().filter(MarketingSend.status == "skipped"),
        func.count().filter(MarketingSend.opens > 0), func.count().filter(MarketingSend.clicks > 0), func.count().filter(MarketingSend.unsubscribed_at.isnot(None)))
        .where(MarketingSend.automation_id.in_(automation_ids)).group_by(MarketingSend.automation_id))).all()
    return {r[0]: dict(zip(("total", "sent", "queued", "failed", "skipped", "opened", "clicked", "unsubscribed"), r[1:], strict=True)) for r in rows}


async def history(db: AsyncSession, automation_id: uuid.UUID, limit: int = 50) -> list[dict[str, Any]]:
    rows = (await db.execute(select(MarketingSend, MarketingContact.business_name, MarketingContact.name)
                             .join(MarketingContact, MarketingContact.id == MarketingSend.contact_id)
                             .where(MarketingSend.automation_id == automation_id).order_by(MarketingSend.queued_at.desc()).limit(limit))).all()
    return [{"id": str(s.id), "contact": biz or name or s.email, "email": s.email, "status": s.status, "reason": s.reason, "queuedAt": s.queued_at,
             "sentAt": s.sent_at, "opens": s.opens, "clicks": s.clicks} for s, biz, name in rows]


