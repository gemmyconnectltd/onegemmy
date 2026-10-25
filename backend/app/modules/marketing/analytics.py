"""Marketing analytics from what the platform actually records.

Honest limits of SMTP-based sending: a message is `sent` when the mail server accepted it — we do not learn about inbox
delivery, so there is no "delivered" figure. Hard bounces are only the addresses the server rejected while sending.
Opens come from a tracking pixel (blocked or pre-fetched by many clients, so approximate); clicks come from tracked
links (security scanners can add a few). Campaign-driven signups use the utm tags added to links to pesaa.io and the
first-touch attribution Website Traffic already records — nothing is inferred beyond that."""
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.analytics import (
    Period,
    _bucket_expr,
    bucket_keys,
    bucket_label,
    change_pct,
    default_group_by,
)
from app.modules.marketing import contacts as contacts_svc
from app.modules.marketing import engine
from app.modules.marketing import settings as mkt_settings
from app.modules.marketing.models import (
    MarketingCampaign,
    MarketingContact,
    MarketingEvent,
    MarketingSend,
)

_ATTRIBUTION = text("""
WITH vids AS (SELECT DISTINCT visitor_id FROM website_visits WHERE utm_campaign = ANY(:slugs) AND created_at >= :since),
ft AS (
  SELECT DISTINCT ON (v.visitor_id) v.visitor_id, v.utm_campaign FROM website_visits v JOIN vids ON vids.visitor_id = v.visitor_id
  ORDER BY v.visitor_id, v.created_at ASC
), paid AS (SELECT tenant_id FROM billing_payments WHERE status = 'succeeded' AND amount > 0 GROUP BY tenant_id)
SELECT ft.utm_campaign, count(*) AS signups, count(p.tenant_id) AS paying
FROM tenants t JOIN ft ON ft.visitor_id = t.attribution_visitor_id LEFT JOIN paid p ON p.tenant_id = t.id
WHERE ft.utm_campaign = ANY(:slugs) GROUP BY ft.utm_campaign
""")


def _rate(part: int, whole: int) -> float | None:
    return round(part / whole * 100, 1) if whole else None


async def _send_totals(db: AsyncSession, s: datetime, e: datetime) -> dict[str, int]:
    row = (await db.execute(select(
        func.count().filter(MarketingSend.status == "sent"), func.count().filter(MarketingSend.status == "failed"),
        func.count().filter(MarketingSend.status == "bounced"),
        func.count().filter((MarketingSend.status == "sent") & (MarketingSend.opens > 0)),
        func.count().filter((MarketingSend.status == "sent") & (MarketingSend.clicks > 0)),
        func.count().filter(MarketingSend.unsubscribed_at.isnot(None)),
    ).where(MarketingSend.queued_at >= s, MarketingSend.queued_at < e))).one()
    return dict(zip(("sent", "failed", "bounced", "opened", "clicked", "unsubscribed"), row, strict=True))


async def _campaigns_sent(db: AsyncSession, s: datetime, e: datetime) -> int:
    return (await db.execute(select(func.count()).select_from(MarketingCampaign).where(
        MarketingCampaign.kind.in_(("campaign", "issue")), MarketingCampaign.started_at >= s, MarketingCampaign.started_at < e))).scalar_one()


async def overview(db: AsyncSession, period: Period) -> dict[str, Any]:
    cfg = await mkt_settings.get_section(db, "compliance")
    await contacts_svc.sync_tenant_contacts(db)
    s, e, unit = period.start, period.end, default_group_by(period.days)
    eligible = (await db.execute(contacts_svc.contact_select(func.count()).where(*contacts_svc.eligibility(cfg["consent_mode"])))).scalar_one()
    subscribers = (await db.execute(contacts_svc.contact_select(func.count()).where(*contacts_svc.eligibility(cfg["consent_mode"], newsletter=True)))).scalar_one()
    cur, prev = await _send_totals(db, s, e), await _send_totals(db, period.prev_start, period.prev_end)
    camp_cur, camp_prev = await _campaigns_sent(db, s, e), await _campaigns_sent(db, period.prev_start, period.prev_end)
    rate, prev_rate = _rate(cur["clicked"], cur["sent"]), _rate(prev["clicked"], prev["sent"])

    bucket = _bucket_expr(MarketingContact.created_at, unit)  # type: ignore[arg-type]
    base = (await db.execute(select(func.count()).select_from(MarketingContact).where(MarketingContact.created_at < s))).scalar_one()
    added = {r[0]: r[1] for r in (await db.execute(select(bucket.label("b"), func.count()).where(MarketingContact.created_at >= s, MarketingContact.created_at < e).group_by(bucket))).all()}
    growth, total = [], base
    for k in bucket_keys(period, unit):
        total += added.get(k, 0)
        growth.append({"period": bucket_label(k, unit), "new": added.get(k, 0), "total": total})

    recent = (await db.execute(select(MarketingCampaign).where(MarketingCampaign.kind.in_(("campaign", "issue"))).order_by(MarketingCampaign.created_at.desc()).limit(5))).scalars().all()
    stats = await _campaign_stats(db, [c.id for c in recent])
    return {
        "period": period.describe(), "groupBy": unit, "consentMode": cfg["consent_mode"],
        "kpis": {
            "eligibleContacts": {"value": eligible},
            "newsletterSubscribers": {"value": subscribers},
            "campaignsSent": {"value": camp_cur, "previous": camp_prev, "changePct": change_pct(camp_cur, camp_prev)},
            "engagementRate": {"value": rate, "previous": prev_rate, "changePct": change_pct(rate, prev_rate), "sent": cur["sent"]},
        },
        "growth": growth,
        "recent": [{"id": str(c.id), "name": c.name, "kind": c.kind, "status": c.status, "scheduledAt": c.scheduled_at, "startedAt": c.started_at,
                    "recipients": c.recipient_count, **stats.get(c.id, {})} for c in recent],
    }


async def _campaign_stats(db: AsyncSession, ids: list[Any]) -> dict[Any, dict[str, Any]]:
    if not ids:
        return {}
    rows = (await db.execute(select(
        MarketingSend.campaign_id, func.count().filter(MarketingSend.status == "sent"), func.count().filter(MarketingSend.status == "failed"),
        func.count().filter(MarketingSend.status == "bounced"), func.count().filter((MarketingSend.status == "sent") & (MarketingSend.opens > 0)),
        func.count().filter((MarketingSend.status == "sent") & (MarketingSend.clicks > 0)), func.count().filter(MarketingSend.unsubscribed_at.isnot(None)),
    ).where(MarketingSend.campaign_id.in_(ids)).group_by(MarketingSend.campaign_id))).all()
    return {r[0]: {"sent": r[1], "failed": r[2], "bounced": r[3], "opened": r[4], "clicked": r[5], "unsubscribed": r[6],
                   "openRate": _rate(r[4], r[1]), "clickRate": _rate(r[5], r[1])} for r in rows}


def _health(value: float | None, warn: float, bad: float) -> str:
    if value is None:
        return "unknown"
    return "bad" if value >= bad else "warn" if value >= warn else "good"


async def performance(db: AsyncSession, period: Period) -> dict[str, Any]:
    s, e, unit = period.start, period.end, default_group_by(period.days)
    cur, prev = await _send_totals(db, s, e), await _send_totals(db, period.prev_start, period.prev_end)

    async def per_bucket(col: Any, *where: Any, kind: str | None = None) -> dict[Any, int]:
        b = _bucket_expr(col, unit)
        stmt = select(b.label("b"), func.count()).where(col >= s, col < e, *where).group_by(b)
        return {r[0]: r[1] for r in (await db.execute(stmt)).all()}

    sent_b = await per_bucket(MarketingSend.sent_at, MarketingSend.status == "sent")
    open_b = await per_bucket(MarketingEvent.created_at, MarketingEvent.kind == "open")
    click_b = await per_bucket(MarketingEvent.created_at, MarketingEvent.kind == "click")
    unsub_b = await per_bucket(MarketingEvent.created_at, MarketingEvent.kind == "unsubscribe")
    new_sub = await per_bucket(MarketingContact.newsletter_at, MarketingContact.newsletter_subscribed.is_(True))
    series = [{"period": bucket_label(k, unit), "sent": sent_b.get(k, 0), "opens": open_b.get(k, 0), "clicks": click_b.get(k, 0), "unsubscribes": unsub_b.get(k, 0)}
              for k in bucket_keys(period, unit)]
    subscribers = (await db.execute(select(func.count()).select_from(MarketingContact).where(MarketingContact.newsletter_subscribed.is_(True), MarketingContact.status == "active"))).scalar_one()
    sub_growth, running = [], subscribers - sum(new_sub.values()) + sum(unsub_b.values())
    for k in bucket_keys(period, unit):
        running += new_sub.get(k, 0) - unsub_b.get(k, 0)
        sub_growth.append({"period": bucket_label(k, unit), "subscribers": max(running, 0), "joined": new_sub.get(k, 0), "left": unsub_b.get(k, 0)})

    camps = (await db.execute(select(MarketingCampaign).where(MarketingCampaign.kind.in_(("campaign", "issue")), MarketingCampaign.started_at >= s,
                                                              MarketingCampaign.started_at < e).order_by(MarketingCampaign.started_at.desc()).limit(50))).scalars().all()
    stats = await _campaign_stats(db, [c.id for c in camps])
    slugs = [engine.campaign_slug(c) for c in camps]
    attributed: dict[str, tuple[int, int]] = {}
    if slugs:
        attributed = {r[0]: (r[1], r[2]) for r in (await db.execute(_ATTRIBUTION, {"slugs": slugs, "since": s})).all()}
    table = []
    for c in camps:
        st, (signups, paying) = stats.get(c.id, {}), attributed.get(engine.campaign_slug(c), (0, 0))
        table.append({"id": str(c.id), "name": c.name, "kind": c.kind, "startedAt": c.started_at, "recipients": c.recipient_count, "signups": signups, "paying": paying, **st})

    complained = (await db.execute(select(func.count()).select_from(MarketingContact).where(MarketingContact.status == "complained"))).scalar_one()
    sent_total, attempts = cur["sent"], cur["sent"] + cur["failed"] + cur["bounced"]
    bounce_rate, fail_rate, unsub_rate = _rate(cur["bounced"], attempts), _rate(cur["failed"], attempts), _rate(cur["unsubscribed"], sent_total)
    return {
        "period": period.describe(), "groupBy": unit,
        "totals": {**cur, "uniqueOpens": cur["opened"], "uniqueClicks": cur["clicked"], "previous": prev,
                   "openRate": _rate(cur["opened"], sent_total), "clickRate": _rate(cur["clicked"], sent_total), "complaints": complained,
                   "acceptanceRate": _rate(cur["sent"], attempts)},
        "series": series, "subscriberGrowth": sub_growth, "campaigns": table,
        "health": [
            {"key": "acceptance", "label": "Accepted by mail server", "value": _rate(cur["sent"], attempts), "status": "unknown" if attempts == 0 else ("good" if (_rate(cur["sent"], attempts) or 0) >= 98 else "warn" if (_rate(cur["sent"], attempts) or 0) >= 95 else "bad")},
            {"key": "bounce", "label": "Hard bounce rate", "value": bounce_rate, "status": _health(bounce_rate, 2, 5)},
            {"key": "failure", "label": "Send failure rate", "value": fail_rate, "status": _health(fail_rate, 2, 5)},
            {"key": "unsubscribe", "label": "Unsubscribe rate", "value": unsub_rate, "status": _health(unsub_rate, 0.5, 1.5)},
            {"key": "complaints", "label": "Spam complaints recorded", "value": float(complained), "status": "good" if complained == 0 else "warn"},
        ],
        "limits": {"delivered": "Not available with SMTP — we know the server accepted the message, not that it reached the inbox.",
                   "opens": "Approximate: image blocking and mail-privacy features undercount or pre-fetch opens.",
                   "clicks": "Tracked links; security scanners can add a few clicks."},
    }


