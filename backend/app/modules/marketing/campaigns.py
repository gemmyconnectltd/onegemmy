"""Campaign and newsletter lifecycle on top of the shared send engine.

Campaign states: draft → scheduled → sending → sent, plus paused, cancelled and failed. Content can only be edited while a
campaign is a draft or scheduled; once sending starts it is frozen. Sending is claimed with a conditional UPDATE, so two
clicks (or a click and the scheduler) can never start the same campaign twice."""
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import EmailDeliveryError, send_email_message
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.marketing import contacts as contacts_svc
from app.modules.marketing import engine
from app.modules.marketing import settings as mkt_settings
from app.modules.marketing.models import (
    MarketingCampaign,
    MarketingEvent,
    MarketingSegment,
    MarketingSend,
    MarketingTemplate,
)
from app.modules.marketing.render import (
    blocks_text,
    clean_blocks,
    personalize,
    sample_values,
    unknown_variables,
)

TYPES = ("promotional", "announcement", "product_update", "newsletter")
EDITABLE = ("draft", "scheduled")
FREQUENCIES = ("weekly", "biweekly", "monthly")


def _clean(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, n in (("name", 200), ("subject", 300), ("preheader", 200), ("sender_name", 120), ("sender_email", 255), ("reply_to", 255)):
        if k in data:
            v = str(data[k] or "").strip()[:n]
            out[k] = v or (None if k not in ("name", "subject") else v)
    for k in ("sender_email", "reply_to"):
        if out.get(k) and ("@" not in out[k] or " " in out[k]):
            raise ValidationError("Enter a valid email address")
    if "campaign_type" in data:
        if data["campaign_type"] not in TYPES:
            raise ValidationError("Choose a valid campaign type")
        out["campaign_type"] = data["campaign_type"]
    if "blocks" in data:
        out["blocks"] = clean_blocks(data["blocks"])
    if "template_id" in data:
        out["template_id"] = uuid.UUID(str(data["template_id"])) if data["template_id"] else None
    if "audience" in data:
        a = data["audience"] or {}
        out["audience"] = {"segment_id": str(a["segment_id"]) if a.get("segment_id") else None, "filters": a.get("filters") or {}}
        contacts_svc.filter_conditions(out["audience"]["filters"])  # validates dates etc.
    if bad := unknown_variables(out.get("subject") or "", out.get("preheader") or "", blocks_text(out.get("blocks", []))):
        raise ValidationError("Unknown variable: " + ", ".join("{{" + b + "}}" for b in bad))
    return out


async def get(db: AsyncSession, campaign_id: uuid.UUID, *, lock: bool = False) -> MarketingCampaign:
    c = await db.get(MarketingCampaign, campaign_id, with_for_update=lock)
    if c is None:
        raise NotFoundError("Campaign not found")
    return c


async def resolve_filters(db: AsyncSession, audience: dict[str, Any]) -> dict[str, Any]:
    """A campaign's audience is its saved segment (if any) combined with extra filters."""
    filters = dict(audience.get("filters") or {})
    if audience.get("segment_id"):
        seg = await db.get(MarketingSegment, uuid.UUID(str(audience["segment_id"])))
        if seg is None:
            raise ValidationError("The selected segment no longer exists")
        filters = {**seg.filters, **{k: v for k, v in filters.items() if v not in (None, "", [])}}
    return filters


async def create(db: AsyncSession, user_id: uuid.UUID, data: dict[str, Any], kind: str = "campaign") -> MarketingCampaign:
    if kind not in ("campaign", "newsletter"):
        raise ValidationError("Unknown kind")
    values = _clean({"name": "", "campaign_type": "newsletter" if kind == "newsletter" else "promotional", **data})
    if not values.get("name"):
        raise ValidationError("Give it a name")
    if values.get("template_id") and not values.get("blocks"):
        t = await db.get(MarketingTemplate, values["template_id"])
        if t is None:
            raise ValidationError("That template no longer exists")
        values["blocks"] = t.blocks
        values.setdefault("subject", t.subject or "")
        values.setdefault("preheader", t.preheader)
    campaign = MarketingCampaign(kind=kind, created_by=user_id, status="draft", **values)
    if kind == "newsletter":
        campaign.status, campaign.schedule = "draft", _clean_schedule(data.get("schedule"), required=False)
    db.add(campaign)
    await db.flush()
    return campaign


def _clean_schedule(s: Any, *, required: bool) -> dict[str, Any] | None:
    if not s:
        if required:
            raise ValidationError("Set how often the newsletter goes out")
        return None
    if s.get("frequency") not in FREQUENCIES:
        raise ValidationError("Choose weekly, every two weeks or monthly")
    hour = int(s.get("hour", 9))
    if not 0 <= hour <= 23:
        raise ValidationError("Choose an hour between 0 and 23")
    out: dict[str, Any] = {"frequency": s["frequency"], "hour": hour, "weekday": int(s.get("weekday", 0)) % 7, "day": min(max(int(s.get("day", 1)), 1), 28)}
    out["next_run_at"] = next_run(out, datetime.now(UTC)).isoformat()
    return out


def next_run(s: dict[str, Any], after: datetime) -> datetime:
    """The next time (UTC) at/after `after` that matches the schedule."""
    base = after.replace(minute=0, second=0, microsecond=0)
    if s["frequency"] == "monthly":
        cand = base.replace(day=s["day"], hour=s["hour"])
        if cand <= after:
            cand = (cand.replace(day=1) + timedelta(days=32)).replace(day=s["day"])
        return cand
    cand = base.replace(hour=s["hour"]) + timedelta(days=(s["weekday"] - base.weekday()) % 7)
    if cand <= after:
        cand += timedelta(days=7)
    return cand


async def update_campaign(db: AsyncSession, campaign_id: uuid.UUID, data: dict[str, Any]) -> MarketingCampaign:
    c = await get(db, campaign_id, lock=True)
    editable = EDITABLE if c.kind != "newsletter" else ("draft", "scheduled", "active", "paused")
    if c.status not in editable:
        raise ValidationError("A campaign that has started sending can't be edited — duplicate it instead")
    for k, v in _clean(data).items():
        setattr(c, k, v)
    if c.kind == "newsletter" and "schedule" in data:
        c.schedule = _clean_schedule(data["schedule"], required=False)
    await db.flush()
    return c


async def duplicate(db: AsyncSession, campaign_id: uuid.UUID, user_id: uuid.UUID) -> MarketingCampaign:
    src = await get(db, campaign_id)
    c = MarketingCampaign(kind="campaign" if src.kind == "issue" else src.kind, name=f"{src.name} (copy)"[:200], campaign_type=src.campaign_type, subject=src.subject,
                          preheader=src.preheader, sender_name=src.sender_name, sender_email=src.sender_email, reply_to=src.reply_to,
                          template_id=src.template_id, blocks=src.blocks, audience=src.audience, status="draft", created_by=user_id,
                          schedule=({**src.schedule, "next_run_at": None} if src.schedule else None))
    db.add(c)
    await db.flush()
    return c


async def readiness(db: AsyncSession, c: MarketingCampaign) -> dict[str, Any]:
    """Pre-send checks shown on the Review step. `blocking` ones stop sending; the rest are warnings."""
    cfg = await mkt_settings.get_all(db)
    filters = await resolve_filters(db, c.audience)
    newsletter = c.kind in ("newsletter", "issue")
    summary = await contacts_svc.audience_summary(db, filters, cfg["compliance"]["consent_mode"], newsletter=newsletter)
    has_content = any(b["type"] in ("paragraph", "heading", "image", "button", "columns") and any(v for v in b["props"].values()) for b in c.blocks)
    sender = engine.from_header(cfg, c)
    checks = [
        {"key": "subject", "label": "Subject line", "ok": bool(c.subject.strip()), "blocking": True, "detail": None if c.subject.strip() else "Add a subject line"},
        {"key": "content", "label": "Email content", "ok": has_content, "blocking": True, "detail": None if has_content else "Add some content"},
        {"key": "audience", "label": "Eligible recipients", "ok": summary["eligible"] > 0, "blocking": True,
         "detail": f"{summary['eligible']:,} will receive it" if summary["eligible"] else "No eligible recipients match this audience"},
        {"key": "provider", "label": "Email provider", "ok": mkt_settings.outbound_configured(), "blocking": True,
         "detail": None if mkt_settings.outbound_configured() else "No email provider is configured on the server"},
        {"key": "address", "label": "Postal address in footer", "ok": bool(cfg["brand"]["address"]) or not cfg["compliance"]["require_address"],
         "blocking": cfg["compliance"]["require_address"], "detail": None if cfg["brand"]["address"] else "Add your business address in Marketing settings"},
        {"key": "unsubscribe", "label": "Unsubscribe link", "ok": True, "blocking": False, "detail": "Added to every message automatically"},
        {"key": "sender", "label": "Sender", "ok": True, "blocking": False, "detail": sender},
    ]
    if engine.safe_mode():
        checks.append({"key": "safe_mode", "label": "Safe mode", "ok": False, "blocking": False,
                       "detail": "Not production: live sends only go to MARKETING_TEST_RECIPIENTS; everyone else is skipped"})
    return {"checks": checks, "canSend": all(x["ok"] or not x["blocking"] for x in checks), "audience": summary, "sender": sender}


async def start_sending(db: AsyncSession, campaign_id: uuid.UUID, *, actor: str) -> MarketingCampaign:
    """draft/scheduled → sending, exactly once. Raises if it can't be sent. Does not commit."""
    c = await get(db, campaign_id, lock=True)
    if c.status not in EDITABLE or c.kind == "newsletter":
        raise ValidationError("This campaign has already been sent or is not ready to send")
    ready = await readiness(db, c)
    if not ready["canSend"]:
        raise ValidationError(next(x["detail"] for x in ready["checks"] if x["blocking"] and not x["ok"]) or "Not ready to send")
    cfg = await mkt_settings.get_section(db, "compliance")
    claimed = await db.execute(update(MarketingCampaign).where(MarketingCampaign.id == c.id, MarketingCampaign.status.in_(EDITABLE))
                               .values(status="sending", started_at=datetime.now(UTC)))
    if claimed.rowcount != 1:
        raise ValidationError("This campaign is already sending")
    await db.refresh(c)
    c.audience = {**c.audience, "filters": await resolve_filters(db, c.audience), "segment_id": c.audience.get("segment_id")}
    queued = await engine.enqueue_campaign(db, c, cfg["consent_mode"])
    if queued == 0:
        raise ValidationError("No eligible recipients")
    return c


async def schedule(db: AsyncSession, campaign_id: uuid.UUID, when: datetime) -> MarketingCampaign:
    c = await get(db, campaign_id, lock=True)
    if c.status not in EDITABLE or c.kind == "newsletter":
        raise ValidationError("Only a draft can be scheduled")
    if when.tzinfo is None:
        when = when.replace(tzinfo=UTC)
    if when < datetime.now(UTC) + timedelta(minutes=2):
        raise ValidationError("Choose a time at least a few minutes from now")
    ready = await readiness(db, c)
    if not ready["canSend"]:
        raise ValidationError(next(x["detail"] for x in ready["checks"] if x["blocking"] and not x["ok"]) or "Not ready to send")
    c.status, c.scheduled_at = "scheduled", when
    await db.flush()
    return c


async def unschedule(db: AsyncSession, campaign_id: uuid.UUID) -> MarketingCampaign:
    c = await get(db, campaign_id, lock=True)
    if c.status != "scheduled":
        raise ValidationError("This campaign isn't scheduled")
    c.status, c.scheduled_at = "draft", None
    await db.flush()
    return c


async def set_state(db: AsyncSession, campaign_id: uuid.UUID, action: str) -> MarketingCampaign:
    """pause / resume / cancel a running or scheduled campaign. Cancelling stops every message not yet sent."""
    c = await get(db, campaign_id, lock=True)
    if action == "pause" and c.status == "sending":
        c.status = "paused"
    elif action == "resume" and c.status == "paused":
        c.status = "sending"
    elif action == "cancel" and c.status in ("scheduled", "sending", "paused"):
        c.status, c.completed_at = "cancelled", datetime.now(UTC)
        await db.execute(update(MarketingSend).where(MarketingSend.campaign_id == c.id, MarketingSend.status == "pending")
                         .values(status="skipped", reason="Campaign cancelled", next_attempt_at=None))
    else:
        raise ValidationError(f"A {c.status} campaign can't be {action}d")
    await db.flush()
    return c


async def send_test(db: AsyncSession, c: MarketingCampaign, to: str) -> str:
    """Sends one real copy to an address typed in by the admin, marked [TEST]. Never touches contacts or the outbox."""
    email, bad = contacts_svc.check_email(to)
    if not email or (bad and bad != "Test or placeholder domain"):
        raise ValidationError("Enter a valid email address")
    if not mkt_settings.outbound_configured():
        raise ValidationError("No email provider is configured on the server")
    cfg = await mkt_settings.get_all(db)
    html, text = engine.render_for(c.blocks, subject=c.subject, preheader=c.preheader, cfg=cfg)
    values = sample_values() | {"email": email, "unsubscribe_url": "https://pesaa.io/unsubscribe-preview"}
    try:
        mid = await send_email_message(email, f"[TEST] {personalize(c.subject, values, html_mode=False)}", personalize(html, values, html_mode=True),
                                       personalize(text, values, html_mode=False), c.reply_to or cfg["general"]["reply_to"] or None, "marketing",
                                       from_header=engine.from_header(cfg, c), raise_errors=True)
    except EmailDeliveryError as e:
        raise ValidationError("The mail server didn't accept the test message" + (" (delivery uncertain)" if e.uncertain else "")) from e
    return mid or ""


async def results(db: AsyncSession, campaign_id: uuid.UUID) -> dict[str, Any]:
    c = await get(db, campaign_id)
    ids = [campaign_id]
    if c.kind == "newsletter":
        ids += list((await db.execute(select(MarketingCampaign.id).where(MarketingCampaign.parent_id == campaign_id))).scalars().all())
    row = (await db.execute(select(
        func.count(), *[func.count().filter(MarketingSend.status == s) for s in ("pending", "sending", "sent", "failed", "bounced", "skipped")],
        func.count().filter(MarketingSend.opens > 0), func.count().filter(MarketingSend.clicks > 0), func.count().filter(MarketingSend.unsubscribed_at.isnot(None)),
        func.coalesce(func.sum(MarketingSend.clicks), 0),
    ).where(MarketingSend.campaign_id.in_(ids)))).one()
    links = (await db.execute(select(MarketingEvent.url, func.count()).where(MarketingEvent.campaign_id.in_(ids), MarketingEvent.kind == "click")
                              .group_by(MarketingEvent.url).order_by(func.count().desc()).limit(10))).all()
    total, pending, sending, sent, failed, bounced, skipped, opened, clicked, unsub, click_events = row
    return {"total": total, "queued": pending + sending, "sent": sent, "failed": failed, "bounced": bounced, "skipped": skipped,
            "uniqueOpens": opened, "uniqueClicks": clicked, "unsubscribed": unsub, "clickEvents": int(click_events),
            "openRate": round(opened / sent * 100, 1) if sent else None, "clickRate": round(clicked / sent * 100, 1) if sent else None,
            "bounceRate": round(bounced / total * 100, 1) if total else None, "unsubscribeRate": round(unsub / sent * 100, 2) if sent else None,
            "topLinks": [{"url": u, "clicks": n} for u, n in links]}


# ── Newsletters ───────────────────────────────────────────────────────────────

async def activate_newsletter(db: AsyncSession, newsletter_id: uuid.UUID) -> MarketingCampaign:
    n = await get(db, newsletter_id, lock=True)
    if n.kind != "newsletter" or n.status not in ("draft", "paused"):
        raise ValidationError("Only a draft or paused newsletter can be activated")
    if not n.schedule:
        raise ValidationError("Set how often the newsletter goes out")
    ready = await readiness(db, n)
    if not ready["canSend"]:
        raise ValidationError(next(x["detail"] for x in ready["checks"] if x["blocking"] and not x["ok"]) or "Not ready")
    n.status = "active"
    n.schedule = {**n.schedule, "next_run_at": next_run(n.schedule, datetime.now(UTC)).isoformat()}
    await db.flush()
    return n


async def pause_newsletter(db: AsyncSession, newsletter_id: uuid.UUID) -> MarketingCampaign:
    n = await get(db, newsletter_id, lock=True)
    if n.kind != "newsletter" or n.status != "active":
        raise ValidationError("Only an active newsletter can be paused")
    n.status = "paused"
    await db.flush()
    return n


async def publish_issue(db: AsyncSession, newsletter_id: uuid.UUID, *, actor: str) -> MarketingCampaign:
    """Creates one issue from the newsletter's current content and starts sending it through the shared engine."""
    n = await get(db, newsletter_id)
    if n.kind != "newsletter":
        raise ValidationError("Not a newsletter")
    count = (await db.execute(select(func.count()).select_from(MarketingCampaign).where(MarketingCampaign.parent_id == n.id))).scalar_one()
    issue = MarketingCampaign(kind="issue", parent_id=n.id, name=f"{n.name} · issue {count + 1}"[:200], campaign_type="newsletter", subject=n.subject,
                              preheader=n.preheader, sender_name=n.sender_name, sender_email=n.sender_email, reply_to=n.reply_to, template_id=n.template_id,
                              blocks=n.blocks, audience=n.audience, status="draft", created_by=n.created_by)
    db.add(issue)
    await db.flush()
    return await start_sending(db, issue.id, actor=actor)
