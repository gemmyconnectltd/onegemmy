"""Seed demo Marketing Hub data into a LOCAL database so Super Admin → Marketing has something to show.

    python -m scripts.seed_marketing            # (re)seed demo contacts, campaigns, a newsletter and their engagement
    python -m scripts.seed_marketing --reset    # remove only what this script created

Refuses unless ENVIRONMENT=local and the database is on this machine. Everything it creates is recognisable and removable:
contacts tagged `demo` at @demo-pesaa-contacts.net, campaigns/newsletters named “[Demo] …”. Nothing is ever sent — the
engagement is written straight to the tables — and local sends are blocked by safe mode anyway. Production starts empty."""
import asyncio
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from sqlalchemy import delete

import app.main  # noqa: F401  (registers every ORM model)
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.marketing.models import (
    MarketingAutomation,
    MarketingCampaign,
    MarketingContact,
    MarketingEvent,
    MarketingSegment,
    MarketingSend,
)
from app.modules.marketing.templates import SYSTEM_TEMPLATES, ensure_system_templates

DOMAIN = "demo-pesaa-contacts.net"
FIRST = ["Amina", "Jean", "Grace", "Eric", "Aline", "Patrick", "Chantal", "David", "Sandrine", "Olivier", "Esther", "Kevin", "Diane", "Samuel", "Claire", "Moses", "Aisha", "Peter", "Naomi", "Brian"]
LAST = ["Uwase", "Mugisha", "Ingabire", "Habimana", "Mukamana", "Nshuti", "Iradukunda", "Kamanzi", "Uwimana", "Niyonzima", "Okello", "Mwangi", "Njoroge", "Otieno", "Banda"]
BIZ = ["Pharmacy", "Mini-market", "Hardware", "Boutique", "Salon", "Cafe", "Electronics", "Auto parts", "Wholesale", "Agro supplies"]
COUNTRIES = ["Rwanda", "Rwanda", "Rwanda", "Kenya", "Uganda", "Tanzania", "Burundi"]
TAGS = ["retail", "pharmacy", "food", "services", "vip", "expo-2026", "webinar"]
BLOCKS = [{"id": "a", "type": "header", "props": {"tagline": ""}}, {"id": "b", "type": "heading", "props": {"text": "Hello {{first_name}}", "level": 1, "align": "left"}},
          {"id": "c", "type": "paragraph", "props": {"text": "This is demo content for {{business_name}}.", "align": "left"}},
          {"id": "d", "type": "button", "props": {"label": "Open Pesaa", "url": "https://pesaa.io", "align": "center"}}]


async def reset(db) -> None:
    await db.execute(delete(MarketingCampaign).where(MarketingCampaign.name.like("[Demo]%")))
    await db.execute(delete(MarketingAutomation).where(MarketingAutomation.name.like("[Demo]%")))
    await db.execute(delete(MarketingSegment).where(MarketingSegment.name.like("[Demo]%")))
    await db.execute(delete(MarketingContact).where(MarketingContact.email.like(f"%@{DOMAIN}")))


async def seed(db, now: datetime) -> dict[str, int]:
    rng = random.Random(11)
    await ensure_system_templates(db)
    contacts = []
    for i in range(80):
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        sub = i < 55
        c = MarketingContact(email=f"{name.lower().replace(' ', '.')}{i}@{DOMAIN}", name=name, business_name=f"{name.split()[1]} {rng.choice(BIZ)}", source="import", country=rng.choice(COUNTRIES),
                             consent="subscribed", consent_source="Demo import", consent_at=now - timedelta(days=rng.randint(10, 250)), tags=sorted(rng.sample(TAGS, rng.randint(1, 2)) + ["demo"]),
                             newsletter_subscribed=sub and i < 38, newsletter_at=now - timedelta(days=rng.randint(5, 200)) if (sub and i < 38) else None,
                             status="active" if i < 72 else rng.choice(["unsubscribed", "bounced", "complained", "unsubscribed"]), created_at=now - timedelta(days=rng.randint(5, 250)))
        if c.status != "active":
            c.status_reason, c.status_at, c.newsletter_subscribed = "Demo suppression", now - timedelta(days=rng.randint(1, 60)), False
        contacts.append(c)
    db.add_all(contacts)
    db.add(MarketingSegment(name="[Demo] Rwanda retail", description="Retail contacts in Rwanda", filters={"countries": ["Rwanda"], "tags": ["retail"]}))
    await db.flush()
    active = [c for c in contacts if c.status == "active"]

    def campaign(name: str, kind: str, days_ago: int, status: str, parent=None, subject="Demo update") -> MarketingCampaign:
        started = now - timedelta(days=days_ago, hours=3)
        return MarketingCampaign(name=name, kind=kind, parent_id=parent.id if parent else None, campaign_type="newsletter" if kind != "campaign" else "promotional", subject=subject,
                                 preheader="Demo preheader", blocks=BLOCKS, audience={"filters": {"tags": ["demo"]}}, status=status,
                                 started_at=started if status in ("sent", "sending") else None, completed_at=started + timedelta(minutes=12) if status == "sent" else None,
                                 scheduled_at=now + timedelta(days=3) if status == "scheduled" else None)

    sent_campaigns = [campaign("[Demo] Product launch", "campaign", 70, "sent", subject="Introducing our new features"), campaign("[Demo] Spring promotion", "campaign", 38, "sent", subject="A spring offer for your business"),
                      campaign("[Demo] Feature announcement", "campaign", 9, "sent", subject="What's new this month")]
    series = campaign("[Demo] Pesaa monthly newsletter", "newsletter", 0, "active", subject="Pesaa news")
    series.schedule = {"frequency": "monthly", "day": 1, "hour": 9, "weekday": 0, "next_run_at": (now + timedelta(days=6)).isoformat()}
    db.add_all([*sent_campaigns, series, campaign("[Demo] Holiday greetings", "campaign", 0, "draft", subject="Season's greetings"), campaign("[Demo] Webinar invite", "campaign", 0, "scheduled", subject="Join our webinar")])
    await db.flush()
    issues = [campaign(f"[Demo] Pesaa monthly newsletter · issue {i + 1}", "issue", 90 - 30 * i if False else 75 - 30 * i, "sent", parent=series, subject="Pesaa news") for i in range(3)]
    db.add_all(issues)
    await db.flush()

    sends = events = 0
    pending: list[MarketingEvent] = []  # events reference sends, so they are added only after the sends are flushed
    for camp in [*sent_campaigns, *issues]:
        pool = [c for c in active if (camp.kind != "issue" or c.newsletter_subscribed)]
        camp.recipient_count = len(pool)
        for c in pool:
            r = rng.random()
            status = "sent" if r < 0.94 else ("failed" if r < 0.97 else "bounced")
            at = camp.started_at + timedelta(seconds=rng.randint(5, 700))
            s = MarketingSend(id=uuid.uuid4(), campaign_id=camp.id, contact_id=c.id, email=c.email, status=status, sent_at=at if status == "sent" else None,
                              reason=None if status == "sent" else ("Mail server rejected the address" if status == "bounced" else "Mail server didn't accept the message"), attempts=1, queued_at=camp.started_at)
            sends += 1
            if status == "sent" and rng.random() < 0.46:
                s.opens, s.first_open_at = rng.randint(1, 4), at + timedelta(minutes=rng.randint(2, 600))
                pending.append(MarketingEvent(send_id=s.id, campaign_id=camp.id, kind="open", created_at=s.first_open_at))
                events += 1
                if rng.random() < 0.28:
                    s.clicks, s.first_click_at = rng.randint(1, 3), s.first_open_at + timedelta(minutes=rng.randint(1, 30))
                    pending.append(MarketingEvent(send_id=s.id, campaign_id=camp.id, kind="click", url="https://pesaa.io/pricing", created_at=s.first_click_at))
                    events += 1
            if status == "sent" and rng.random() < 0.012:
                s.unsubscribed_at = at + timedelta(hours=2)
                pending.append(MarketingEvent(send_id=s.id, campaign_id=camp.id, kind="unsubscribe", created_at=s.unsubscribed_at))
                events += 1
            db.add(s)
    await db.flush()
    db.add_all(pending)
    for kind, name in (("welcome", "[Demo] Welcome series"), ("onboarding", "[Demo] Onboarding follow-up"), ("renewal", "[Demo] Renewal reminder"), ("reengagement", "[Demo] Re-engagement")):
        tpl = next(t for t in SYSTEM_TEMPLATES if kind in t["name"].lower() or (kind == "reengagement" and "hear from you" in t["name"].lower()) or (kind == "onboarding" and "onboarding" in t["name"].lower()))
        trigger = {"welcome": "signup", "onboarding": "no_sale_after_signup", "renewal": "renewal_due", "reengagement": "inactive"}[kind]
        db.add(MarketingAutomation(name=name, kind=kind, trigger=trigger, subject=tpl["subject"], preheader=tpl["preheader"], blocks=tpl["blocks"], active=False,
                                   params={"welcome": {}, "onboarding": {"days": 3}, "renewal": {"days_before": 7}, "reengagement": {"inactive_days": 30}}[kind]))
    return {"contacts": len(contacts), "sends": sends, "events": events}


async def main() -> None:
    host = urlsplit(settings.DATABASE_URL.replace("+asyncpg", "")).hostname
    if settings.ENVIRONMENT != "local" or host not in {"localhost", "127.0.0.1", "::1"}:
        sys.exit(f"Refusing to seed: ENVIRONMENT={settings.ENVIRONMENT!r}, database host={host!r}. Local databases only.")
    async with AsyncSessionLocal() as db:
        await reset(db)
        if "--reset" in sys.argv:
            await db.commit()
            print("Removed seeded marketing data.")
            return
        out = await seed(db, datetime.now(UTC))
        await db.commit()
    print(f"Seeded {out['contacts']} demo contacts, 3 campaigns + a newsletter with 3 issues, {out['sends']} sends and {out['events']} engagement events.")


if __name__ == "__main__":
    asyncio.run(main())
