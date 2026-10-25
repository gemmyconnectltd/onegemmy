"""Seed demo ERP page-view activity into a LOCAL database so Super Admin → ERP Traffic has something to show.

    python -m scripts.seed_erp_traffic            # (re)seed from each business's signup date → now
    python -m scripts.seed_erp_traffic --reset    # remove the seeded rows only

Same safety as seed_website_traffic: refuses unless ENVIRONMENT=local and the database is on this machine, so
production's `erp_activity` starts empty and records real usage only. Seeded rows have a session id starting with
`seed-`; only those are touched. Activity is generated for existing local businesses and users, never earlier than a
business's signup date. No business, user or payment records are created or changed.
"""
import asyncio
import random
import sys
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit

from sqlalchemy import insert, text

import app.main  # noqa: F401  (registers every ORM model)
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.traffic.classify import erp_module
from app.modules.traffic.models import ErpActivity

PREFIX = "seed-"
PROFILES = [("heavy", 0.20, 0.85), ("medium", 0.35, 0.55), ("light", 0.30, 0.22), ("dormant", 0.15, 0.03)]
PATHS = {
    "dashboard": ["/dashboard"], "sales": ["/sales", "/sales/orders", "/sales/analytics"], "pos": ["/pos"],
    "inventory": ["/inventory", "/inventory/products", "/inventory/stock", "/products"], "purchases": ["/procurement", "/procurement/orders"],
    "expenses": ["/expenses"], "customers": ["/customers", "/customers/loyalty"], "accounting": ["/accounting", "/accounting/invoices"],
    "reports": ["/reports", "/reports/sales"], "hr": ["/hr", "/hr/employees"], "settings": ["/settings", "/settings/team"],
    "debts": ["/debts"], "services": ["/services"], "manufacturing": ["/manufacturing"], "branches": ["/branches"],
}
WEIGHTS = {"dashboard": 14, "sales": 18, "pos": 16, "inventory": 14, "purchases": 5, "expenses": 6, "customers": 6, "accounting": 6,
           "reports": 6, "hr": 2, "settings": 3, "debts": 2, "services": 1, "manufacturing": 1, "branches": 1}


async def reset(db) -> None:
    await db.execute(text("DELETE FROM erp_activity WHERE session_id LIKE :p"), {"p": f"{PREFIX}%"})


DEVICES = [
    ("desktop", 50, [("Windows", "Chrome"), ("Windows", "Chrome"), ("Windows", "Edge"), ("macOS", "Safari"), ("macOS", "Chrome"), ("Linux", "Firefox"), ("Windows", "Firefox")]),
    ("mobile", 32, [("Android", "Chrome"), ("Android", "Chrome"), ("Android", "Samsung Internet"), ("iOS", "Safari"), ("Android", "In-app browser")]),
    ("tablet", 18, [("Android", "Chrome"), ("iOS", "Safari"), ("Android", "Samsung Internet")]),
]


def pick_device(rng: random.Random) -> tuple[str, str, str]:
    name, _, combos = rng.choices(DEVICES, [d[1] for d in DEVICES])[0]
    os_, browser = rng.choice(combos)
    return name, os_, browser


def session_rows(rng: random.Random, tenant, user, start: datetime, now: datetime, focus: list[str], device: tuple[str, str, str]) -> list[dict]:
    rows, at = [], start
    device = device if rng.random() < 0.85 else pick_device(rng)  # most sessions use the person's usual device
    module = rng.choices(list(WEIGHTS), [WEIGHTS[m] * (3 if m in focus else 1) for m in WEIGHTS])[0]
    sid = f"{PREFIX}{uuid.UUID(int=rng.getrandbits(128))}"
    for _ in range(rng.randint(3, 24)):
        if rng.random() < 0.45:
            module = rng.choices(list(WEIGHTS), [WEIGHTS[m] * (3 if m in focus else 1) for m in WEIGHTS])[0]
        at += timedelta(seconds=rng.randint(8, 150))
        if at > now:
            break
        path = rng.choice(PATHS[module])
        rows.append({"id": uuid.uuid4(), "tenant_id": tenant, "user_id": user, "session_id": sid, "module": erp_module(path),
                     "surface": "pos" if module == "pos" else "erp", "path": path, "device": device[0], "os": device[1],
                     "browser": device[2], "created_at": at})
    return rows


async def seed(db, now: datetime) -> tuple[int, int]:
    rng = random.Random(7)
    people = (await db.execute(text(
        "SELECT t.id, t.created_at, u.id FROM tenants t JOIN users u ON u.tenant_id = t.id "
        "WHERE t.is_active AND u.is_active ORDER BY t.created_at, u.created_at"
    ))).all()
    usual = {uid: pick_device(rng) for _, _, uid in people}
    by_tenant: dict = {}
    for tid, created, uid in people:
        by_tenant.setdefault(tid, (created, []))[1].append(uid)
    rows: list[dict] = []
    for tid, (created, users) in by_tenant.items():
        profile = rng.choices(PROFILES, [p[1] for p in PROFILES])[0]
        focus = rng.sample(list(WEIGHTS), 2)
        ends = now
        if profile[0] != "dormant" and rng.random() < 0.14:  # went quiet some weeks ago
            ends = now - timedelta(days=rng.randint(10, 40))
        day = max(created, datetime(now.year, 1, 1, tzinfo=UTC)).replace(hour=0, minute=0, second=0, microsecond=0)
        while day <= min(ends, now):
            weekday = 0.3 if day.weekday() >= 5 else 1.0
            for uid in users:
                if rng.random() < profile[2] * weekday:
                    for _ in range(rng.randint(1, 3)):
                        hour = int(min(21, max(6, rng.gauss(11.5, 3))))
                        begin = day + timedelta(hours=hour, minutes=rng.randrange(60))
                        if begin >= created:
                            rows += session_rows(rng, tid, uid, begin, now, focus, usual[uid])
            day += timedelta(days=1)
    # A live trickle so the Realtime card is not empty.
    live = [(tid, users) for tid, (_, users) in by_tenant.items()][:40]
    for tid, users in rng.sample(live, min(8, len(live))):
        uid = rng.choice(users)
        rows += session_rows(rng, tid, uid, now - timedelta(minutes=rng.randint(1, 4)) - timedelta(seconds=30), now, ["pos", "sales"], usual[uid])
    for i in range(0, len(rows), 5000):
        await db.execute(insert(ErpActivity), rows[i:i + 5000])
    return len(rows), len(by_tenant)


async def main() -> None:
    host = urlsplit(settings.DATABASE_URL.replace("+asyncpg", "")).hostname
    if settings.ENVIRONMENT != "local" or host not in {"localhost", "127.0.0.1", "::1"}:
        sys.exit(f"Refusing to seed: ENVIRONMENT={settings.ENVIRONMENT!r}, database host={host!r}. Local databases only.")
    async with AsyncSessionLocal() as db:
        await reset(db)
        if "--reset" in sys.argv:
            await db.commit()
            print("Removed seeded ERP activity.")
            return
        views, businesses = await seed(db, datetime.now(UTC))
        await db.commit()
    from app.modules.admin.analytics import invalidate_analytics_cache
    invalidate_analytics_cache()
    print(f"Seeded {views:,} ERP page views across {businesses} businesses.")


if __name__ == "__main__":
    asyncio.run(main())
