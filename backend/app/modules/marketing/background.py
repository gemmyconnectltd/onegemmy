"""Marketing worker: promotes due scheduled campaigns, publishes due newsletter issues, queues automation sends, then
delivers whatever is pending. One asyncio task; a failure in one step never stops the loop. Safe to run in several
processes — claims use row locks and conditional updates."""
import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.modules.audit.service import record_audit
from app.modules.marketing import automations, campaigns, engine
from app.modules.marketing import settings as mkt_settings
from app.modules.marketing.models import MarketingAutomation, MarketingCampaign

log = get_logger("marketing.background")
_last_automations: datetime | None = None


async def _scheduled_campaigns() -> None:
    async with AsyncSessionLocal() as db:
        due = (await db.execute(select(MarketingCampaign.id).where(MarketingCampaign.status == "scheduled", MarketingCampaign.scheduled_at <= datetime.now(UTC)))).scalars().all()
    for cid in due:
        async with AsyncSessionLocal() as db:
            try:
                c = await campaigns.start_sending(db, cid, actor="scheduler")
                await record_audit(db, tenant_id=None, actor_user_id=None, actor_name="Scheduler", action="marketing.campaign.send", entity_type="marketing_campaign",
                                   entity_id=str(cid), summary=f"Scheduled campaign “{c.name}” started sending to {c.recipient_count} recipients")
                await db.commit()
            except AppError as e:  # e.g. no eligible recipients any more: park it as failed with the reason in the audit trail
                await db.rollback()
                async with AsyncSessionLocal() as db2:
                    c = await campaigns.get(db2, cid)
                    c.status, c.completed_at = "failed", datetime.now(UTC)
                    await record_audit(db2, tenant_id=None, actor_user_id=None, actor_name="Scheduler", action="marketing.campaign.failed", entity_type="marketing_campaign",
                                       entity_id=str(cid), summary=f"Scheduled campaign “{c.name}” could not start: {getattr(e, 'detail', e)}"[:300])
                    await db2.commit()


async def _newsletters() -> None:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(MarketingCampaign).where(MarketingCampaign.kind == "newsletter", MarketingCampaign.status == "active"))).scalars().all()
        due = [(n.id, n.schedule["next_run_at"]) for n in rows if n.schedule and n.schedule.get("next_run_at") and datetime.fromisoformat(n.schedule["next_run_at"]) <= datetime.now(UTC)]
    for nid, marker in due:
        async with AsyncSessionLocal() as db:
            n = await campaigns.get(db, nid, lock=True)
            if not n.schedule or n.schedule.get("next_run_at") != marker or n.status != "active":
                continue  # another worker already handled this run
            n.schedule = {**n.schedule, "next_run_at": campaigns.next_run(n.schedule, datetime.now(UTC)).isoformat()}
            await db.commit()
        async with AsyncSessionLocal() as db:
            try:
                issue = await campaigns.publish_issue(db, nid, actor="scheduler")
                await record_audit(db, tenant_id=None, actor_user_id=None, actor_name="Scheduler", action="marketing.newsletter.issue", entity_type="marketing_campaign",
                                   entity_id=str(issue.id), summary=f"Newsletter issue “{issue.name}” started sending to {issue.recipient_count} subscribers")
                await db.commit()
            except AppError:
                await db.rollback()
                log.warning("marketing.newsletter_issue_skipped", extra={"_extra_fields": {"newsletter_id": str(nid)}})


async def _automations() -> None:
    global _last_automations
    if _last_automations and (datetime.now(UTC) - _last_automations).total_seconds() < 300:
        return
    _last_automations = datetime.now(UTC)
    async with AsyncSessionLocal() as db:
        active = (await db.execute(select(MarketingAutomation).where(MarketingAutomation.active.is_(True), MarketingAutomation.trigger != "manual"))).scalars().all()
        for a in active:
            queued = await automations.enqueue(db, a)
            if queued:
                log.info("marketing.automation_queued", extra={"_extra_fields": {"automation": str(a.id), "queued": queued}})
        await db.commit()


async def _tick() -> None:
    for step in (engine.recover_stuck, _scheduled_campaigns, _newsletters, _automations, engine.dispatch_due, engine.finish_campaigns):
        try:
            await step()
        except Exception:
            log.exception("marketing.step_error", extra={"_extra_fields": {"step": step.__name__}})


async def run_forever(interval: int = 15) -> None:
    while True:
        await _tick()
        await asyncio.sleep(interval)


def start() -> asyncio.Task | None:
    if not settings.MARKETING_BACKGROUND or not mkt_settings.outbound_configured():
        return None
    return asyncio.create_task(run_forever())
