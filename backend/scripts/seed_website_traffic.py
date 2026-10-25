"""Seed demo website-visit data into a LOCAL database so the Super Admin Website Traffic page has something to show.

    python -m scripts.seed_website_traffic            # (re)seed 1 Jan of this year → now
    python -m scripts.seed_website_traffic --reset    # remove the seeded rows only

Refuses to run unless ENVIRONMENT=local and the database is on this machine, so production always starts from an
empty `website_visits` table and records real visits only. Every seeded visitor id starts with `seed-`, which is the
only thing --reset (and a re-seed) touches. Only visits and tenant attribution ids are written — no tenants,
payments or other business records are invented, so "Paying customers" reflects whatever real payments exist.
"""
import asyncio
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from sqlalchemy import insert, text

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.traffic.models import WebsiteVisit

PREFIX = "seed-"
CHANNELS = [("organic", 38), ("direct", 27), ("social", 15), ("referral", 9), ("paid", 8), ("other", 3)]
HOSTS = {
    "organic": ["google.com", "bing.com", "duckduckgo.com"],
    "social": ["facebook.com", "instagram.com", "linkedin.com", "t.co"],
    "referral": ["rwandabusinessnews.rw", "startups.africa", "smeguide.org"],
}
CAMPAIGNS = {
    "paid": ["launch-rwanda", "retail-owners", "pos-demo"],
    "social": ["facebook-promo", "linkedin-founders"],
    "other": ["newsletter"],
}
MEDIUMS = {"paid": "cpc", "social": "social", "other": "email"}
PAGES = [("/", 40), ("/pricing", 18), ("/products/pos", 9), ("/products/inventory", 6), ("/industries/retail", 6),
         ("/company", 4), ("/contact", 4), ("/products/accounting", 4), ("/resources", 5), ("/security", 2),
         ("/industries/pharmacies", 2)]


def pick(rng: random.Random, weighted: list[tuple[str, int]]) -> str:
    return rng.choices([v for v, _ in weighted], [w for _, w in weighted])[0]


def visit_row(rng: random.Random, vid: str, path: str, channel: str, at: datetime, campaign: str | None) -> dict:
    host = rng.choice(HOSTS[channel]) if channel in HOSTS else None
    return {
        "id": uuid.uuid4(), "visitor_id": vid, "path": path, "channel": channel, "referrer_host": host,
        "utm_source": host.split(".")[0] if campaign and host else ("google" if campaign else None),
        "utm_medium": MEDIUMS.get(channel) if campaign else None, "utm_campaign": campaign, "created_at": at,
    }


def landing(rng: random.Random, at: datetime) -> tuple[str, str | None, str]:
    channel = pick(rng, CHANNELS)
    campaign = rng.choice(CAMPAIGNS[channel]) if channel in CAMPAIGNS and rng.random() < 0.85 else None
    return channel, campaign, pick(rng, PAGES)


def day_rows(rng: random.Random, day: datetime, now: datetime, n_visitors: int) -> list[dict]:
    rows: list[dict] = []
    for _ in range(n_visitors):
        vid = f"{PREFIX}{uuid.UUID(int=rng.getrandbits(128))}"
        channel, campaign, path = landing(rng, day)
        # Business hours (UTC+2 East Africa) are busier.
        hour = int(min(23, max(0, rng.gauss(11, 4.5))))
        at = day + timedelta(hours=hour, minutes=rng.randrange(60), seconds=rng.randrange(60))
        if at > now:
            at = now - timedelta(seconds=rng.randrange(1, 3600))
        rows.append(visit_row(rng, vid, path, channel, at, campaign))
        for k in range(int(rng.random() ** 2 * 3)):  # most visitors view 1 page, some up to 3 more
            nxt = at + timedelta(seconds=45 * (k + 1) + rng.randrange(60))
            if nxt <= now:
                rows.append(visit_row(rng, vid, pick(rng, PAGES), channel, nxt, campaign))
    return rows


async def reset(db) -> None:
    await db.execute(text("UPDATE tenants SET attribution_visitor_id = NULL WHERE attribution_visitor_id LIKE :p"), {"p": f"{PREFIX}%"})
    await db.execute(text("DELETE FROM website_visits WHERE visitor_id LIKE :p"), {"p": f"{PREFIX}%"})


async def seed(db, now: datetime) -> tuple[int, int]:
    rng = random.Random(2026)
    start = datetime(now.year, 1, 1, tzinfo=UTC)
    days = (now.date() - start.date()).days + 1
    rows: list[dict] = []
    for i in range(days):
        day = start + timedelta(days=i)
        growth = 40 + 190 * i / max(days - 1, 1)  # traffic builds through the year
        weekday = 0.72 if day.weekday() >= 5 else 1.0
        rows += day_rows(rng, day, now, max(5, int(growth * weekday * rng.uniform(0.8, 1.25))))
    # A live trickle so the Realtime card is not empty: more visitors in the last 30 minutes.
    rows += day_rows(rng, now.replace(hour=0, minute=0, second=0, microsecond=0), now, 0)
    for _ in range(rng.randint(6, 14)):
        vid = f"{PREFIX}{uuid.UUID(int=rng.getrandbits(128))}"
        channel, campaign, path = landing(rng, now)
        rows.append(visit_row(rng, vid, path, channel, now - timedelta(seconds=rng.randrange(30, 1700)), campaign))

    # Link ~70% of the existing local businesses to a visitor whose first visit came just before they signed up.
    tenants = (await db.execute(text("SELECT id, created_at FROM tenants WHERE attribution_visitor_id IS NULL AND created_at >= :s"), {"s": start})).all()
    linked = 0
    for tenant_id, created in tenants:
        if rng.random() > 0.7:
            continue
        vid = f"{PREFIX}{uuid.UUID(int=rng.getrandbits(128))}"
        channel, campaign, path = landing(rng, created)
        first = created - timedelta(minutes=rng.randint(4, 4000))
        rows.append(visit_row(rng, vid, path, channel, first, campaign))
        rows.append(visit_row(rng, vid, "/pricing", channel, first + timedelta(minutes=2), campaign))
        await db.execute(text("UPDATE tenants SET attribution_visitor_id = :v WHERE id = :i"), {"v": vid, "i": tenant_id})
        linked += 1

    for i in range(0, len(rows), 5000):
        await db.execute(insert(WebsiteVisit), rows[i:i + 5000])
    return len(rows), linked


async def main() -> None:
    host = urlsplit(settings.DATABASE_URL.replace("+asyncpg", "")).hostname
    if settings.ENVIRONMENT != "local" or host not in {"localhost", "127.0.0.1", "::1"}:
        sys.exit(f"Refusing to seed: ENVIRONMENT={settings.ENVIRONMENT!r}, database host={host!r}. Local databases only.")
    async with AsyncSessionLocal() as db:
        await reset(db)
        if "--reset" in sys.argv:
            await db.commit()
            print("Removed seeded website visits.")
            return
        visits, linked = await seed(db, datetime.now(UTC))
        await db.commit()
    from app.modules.admin.analytics import invalidate_analytics_cache
    invalidate_analytics_cache()
    print(f"Seeded {visits:,} page views since 1 Jan {datetime.now(UTC).year}; linked {linked} existing businesses to a visit.")


if __name__ == "__main__":
    asyncio.run(main())
