"""ERP Traffic: how businesses and their staff use the signed-in Pesaa app.

Source: `erp_activity`, one row per page view in the ERP/POS (see ErpActivity). Definitions:
- Active user: a distinct user with at least one page view in the period.  Active business: a distinct tenant likewise.
- Session: a distinct session id (a tab, rotating after 30 minutes idle).  Page views: rows.
- Stickiness: average daily active users ÷ active users in the period.
- Quiet business: an active tenant with activity in the previous period and none in this one.
- Everything is platform-wide (never scoped to one tenant) and counts only tenants that are currently active.
"""
import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import distinct, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import ttl_cache
from app.modules.admin.analytics import (
    CACHE_NS,
    Period,
    _bucket_expr,
    _history_ttl,
    _pct,
    _run,
    bucket_keys,
    bucket_label,
    change_pct,
    default_group_by,
)
from app.modules.tenants.models import Tenant
from app.modules.traffic.models import ErpActivity as A

LIMIT = 1000


def _in(s: datetime, e: datetime) -> Any:
    return (A.created_at >= s) & (A.created_at < e)


async def _active_tenants(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.is_active.is_(True)))).scalar_one()


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_totals(s: datetime, e: datetime) -> dict[str, float]:
    async def q(db: AsyncSession) -> dict[str, float]:
        users, biz, sessions, views = (await db.execute(
            select(func.count(distinct(A.user_id)), func.count(distinct(A.tenant_id)), func.count(distinct(A.session_id)), func.count())
            .where(_in(s, e))
        )).one()
        daily = (await db.execute(
            select(func.coalesce(func.sum(text("n")), 0)).select_from(
                select(func.count(distinct(A.user_id)).label("n")).where(_in(s, e))
                .group_by(func.date(func.timezone("UTC", A.created_at))).subquery()
            )
        )).scalar_one()
        return {"users": users, "businesses": biz, "sessions": sessions, "views": views, "dailyUserSum": int(daily),
                "activeTenants": await _active_tenants(db)}

    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_trend(s: datetime, e: datetime, unit: str) -> dict[Any, dict[str, int]]:
    async def q(db: AsyncSession) -> dict[Any, dict[str, int]]:
        b = _bucket_expr(A.created_at, unit)  # type: ignore[arg-type]
        rows = (await db.execute(
            select(b.label("b"), func.count(distinct(A.user_id)), func.count(distinct(A.tenant_id)),
                   func.count(distinct(A.session_id)), func.count())
            .where(_in(s, e)).group_by(b)
        )).all()
        return {r[0]: {"users": r[1], "businesses": r[2], "sessions": r[3], "views": r[4]} for r in rows}

    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_modules(s: datetime, e: datetime) -> list[tuple]:
    async def q(db: AsyncSession) -> list[tuple]:
        rows = (await db.execute(
            select(A.module, func.count().label("views"), func.count(distinct(A.user_id)), func.count(distinct(A.tenant_id)),
                   func.count(distinct(A.session_id)))
            .where(_in(s, e)).group_by(A.module).order_by(text("views DESC"))
        )).all()
        return [tuple(r) for r in rows]

    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_by(s: datetime, e: datetime, dim: str) -> list[tuple]:
    """Distinct users / businesses / sessions and page views grouped by device, os or browser (unknown for old rows)."""
    col = func.coalesce(getattr(A, dim), "unknown")

    async def q(db: AsyncSession) -> list[tuple]:
        rows = (await db.execute(
            select(col.label("k"), func.count(distinct(A.user_id)), func.count(distinct(A.tenant_id)),
                   func.count(distinct(A.session_id)).label("sessions"), func.count())
            .where(_in(s, e)).group_by(col).order_by(text("sessions DESC"))
        )).all()
        return [tuple(r) for r in rows]

    return await _run(q)


def _mix(rows: list[tuple], limit: int | None = None) -> list[dict[str, Any]]:
    total = sum(r[3] for r in rows)
    return [
        {"name": k, "users": u, "businesses": b, "sessions": ss, "views": v, "pct": _pct(ss, total)}
        for k, u, b, ss, v in (rows[:limit] if limit else rows)
    ]


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_businesses(s: datetime, e: datetime, ps: datetime, pe: datetime) -> list[tuple]:
    """Every active tenant with this-period and previous-period activity (zeros included), busiest first."""
    cur = (
        select(A.tenant_id.label("tid"), func.count(distinct(A.user_id)).label("users"),
               func.count(distinct(A.session_id)).label("sessions"), func.count().label("views"), func.max(A.created_at).label("last"))
        .where(_in(s, e)).group_by(A.tenant_id).subquery()
    )
    prev = (
        select(A.tenant_id.label("tid"), func.count().label("views")).where(_in(ps, pe)).group_by(A.tenant_id).subquery()
    )
    ever = select(A.tenant_id.label("tid"), func.max(A.created_at).label("last")).group_by(A.tenant_id).subquery()

    async def q(db: AsyncSession) -> list[tuple]:
        rows = (await db.execute(
            select(Tenant.id, Tenant.name, Tenant.subscription_plan, Tenant.created_at,
                   func.coalesce(cur.c.users, 0), func.coalesce(cur.c.sessions, 0), func.coalesce(cur.c.views, 0),
                   func.coalesce(prev.c.views, 0), ever.c.last)
            .select_from(Tenant)
            .outerjoin(cur, cur.c.tid == Tenant.id).outerjoin(prev, prev.c.tid == Tenant.id).outerjoin(ever, ever.c.tid == Tenant.id)
            .where(Tenant.is_active.is_(True))
            .order_by(func.coalesce(cur.c.views, 0).desc(), func.coalesce(prev.c.views, 0).desc(), Tenant.name)
            .limit(LIMIT)
        )).all()
        return [tuple(r) for r in rows]

    return await _run(q)


def _status(views: int, previous: int) -> str:
    if views == 0 and previous == 0:
        return "inactive"
    if views == 0:
        return "quiet"
    if previous == 0:
        return "new"
    change = (views - previous) / previous * 100
    return "growing" if change >= 20 else "declining" if change <= -20 else "steady"


def _business_row(r: tuple) -> dict[str, Any]:
    tid, name, plan, created, users, sessions, views, previous, last = r
    return {
        "id": str(tid), "name": (name or "").strip(), "plan": plan, "users": users, "sessions": sessions, "views": views,
        "previousViews": previous, "changePct": change_pct(views, previous), "status": _status(views, previous),
        "lastActive": last.isoformat() if last else None, "signedUp": created.isoformat() if created else None,
    }


async def erp_report(period: Period) -> dict[str, Any]:
    s, e = period.start, period.end
    unit = default_group_by(period.days)
    prev_period = Period(start=period.prev_start, end=period.prev_end, prev_start=period.prev_start, prev_end=period.prev_start)
    cur, prev, trend, prev_trend, modules, businesses, devices, oses, browsers = await asyncio.gather(
        _erp_totals(s, e), _erp_totals(period.prev_start, period.prev_end), _erp_trend(s, e, unit),
        _erp_trend(period.prev_start, period.prev_end, unit), _erp_modules(s, e), _erp_businesses(s, e, period.prev_start, period.prev_end),
        _erp_by(s, e, "device"), _erp_by(s, e, "os"), _erp_by(s, e, "browser"),
    )

    def stat(key: str) -> dict[str, Any]:
        return {"value": cur[key], "previous": prev[key], "changePct": change_pct(cur[key], prev[key])}

    stick = _pct(cur["dailyUserSum"] / max(period.days, 1), cur["users"]) if cur["users"] else None
    pps = round(cur["views"] / cur["sessions"], 1) if cur["sessions"] else None
    pps_prev = round(prev["views"] / prev["sessions"], 1) if prev["sessions"] else None

    keys, prev_keys = bucket_keys(period, unit), bucket_keys(prev_period, unit)
    empty = {"users": 0, "businesses": 0, "sessions": 0, "views": 0}
    series = []
    for i, k in enumerate(keys):
        row: dict[str, Any] = {"period": bucket_label(k, unit), **trend.get(k, empty)}
        pk = prev_keys[i] if i < len(prev_keys) else None
        row["previousPeriod"] = bucket_label(pk, unit) if pk else None
        row["previous"] = prev_trend.get(pk, empty) if pk else None
        series.append(row)

    rows = [_business_row(r) for r in businesses]
    quiet = [r for r in rows if r["status"] == "quiet"]
    quiet.sort(key=lambda r: -r["previousViews"])
    return {
        "period": period.describe(), "groupBy": unit, "trackingActive": cur["views"] > 0 or prev["views"] > 0,
        "kpis": {
            "activeUsers": stat("users"), "activeBusinesses": stat("businesses"), "sessions": stat("sessions"), "pageViews": stat("views"),
            "stickiness": {"value": stick, "previous": None, "changePct": None},
            "pagesPerSession": {"value": pps, "previous": pps_prev, "changePct": change_pct(pps, pps_prev)},
            "adoption": {"value": _pct(cur["businesses"], cur["activeTenants"]) if cur["activeTenants"] else None,
                         "activeTenants": cur["activeTenants"]},
        },
        "series": series,
        "modules": [
            {"module": m, "views": v, "users": u, "businesses": b, "sessions": ss, "pctOfViews": _pct(v, cur["views"])}
            for m, v, u, b, ss in modules[:8]
        ],
        "devices": {"types": _mix(devices), "os": _mix(oses, 5), "browsers": _mix(browsers, 5)},
        "topBusinesses": [r for r in rows if r["views"] > 0][:6],
        "quiet": {"count": len(quiet), "items": quiet[:5]},
        "generatedAt": datetime.now(UTC).isoformat(),
    }


async def erp_realtime() -> dict[str, Any]:
    now = datetime.now(UTC)
    since_48h = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=47)
    hour = func.date_trunc("hour", func.timezone("UTC", A.created_at))

    async def q(db: AsyncSession) -> tuple:
        online = (await db.execute(
            select(func.count(distinct(A.user_id)), func.count(distinct(A.tenant_id))).where(A.created_at >= now - timedelta(minutes=5))
        )).one()
        mods = (await db.execute(
            select(A.module, func.count(distinct(A.user_id)).label("n")).where(A.created_at >= now - timedelta(minutes=15))
            .group_by(A.module).order_by(text("n DESC")).limit(5)
        )).all()
        hourly = (await db.execute(
            select(hour.label("h"), func.count(distinct(A.user_id))).where(A.created_at >= since_48h).group_by(hour)
        )).all()
        return online, mods, hourly

    online, mods, hourly = await _run(q)
    by_hour = {h.replace(tzinfo=UTC): n for h, n in hourly}
    return {
        "onlineUsers": online[0], "onlineBusinesses": online[1],
        "activeModules": [{"module": m, "users": n} for m, n in mods],
        "hourly": [{"hour": (since_48h + timedelta(hours=i)).isoformat(), "users": by_hour.get(since_48h + timedelta(hours=i), 0)} for i in range(48)],
        "generatedAt": now.isoformat(),
    }


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_module_trend(s: datetime, e: datetime, unit: str) -> dict[tuple, int]:
    async def q(db: AsyncSession) -> dict[tuple, int]:
        b = _bucket_expr(A.created_at, unit)  # type: ignore[arg-type]
        rows = (await db.execute(select(b.label("b"), A.module, func.count()).where(_in(s, e)).group_by(b, A.module))).all()
        return {(r[0], r[1]): r[2] for r in rows}

    return await _run(q)


async def modules_detail(period: Period) -> dict[str, Any]:
    s, e = period.start, period.end
    unit = default_group_by(period.days)
    cur, trend, active = await asyncio.gather(_erp_modules(s, e), _erp_module_trend(s, e, unit), _run(_active_tenants))
    total = sum(r[1] for r in cur)
    top = [r[0] for r in cur[:8]]
    return {
        "period": period.describe(), "groupBy": unit, "activeTenants": active,
        "modules": [
            {"module": m, "views": v, "users": u, "businesses": b, "sessions": ss, "pctOfViews": _pct(v, total),
             "adoption": _pct(b, active), "viewsPerUser": round(v / u, 1) if u else 0}
            for m, v, u, b, ss in cur
        ],
        "series": [{"period": bucket_label(k, unit), **{m: trend.get((k, m), 0) for m in top}} for k in bucket_keys(period, unit)],
        "seriesModules": top,
    }


async def businesses_detail(period: Period) -> dict[str, Any]:
    rows = await _erp_businesses(period.start, period.end, period.prev_start, period.prev_end)
    items = [_business_row(r) for r in rows]
    counts: dict[str, int] = {}
    for r in items:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {"period": period.describe(), "businesses": items, "counts": counts, "truncated": len(rows) >= LIMIT}


_RETENTION_SQL = text("""
WITH first AS (
  SELECT user_id, date_trunc('week', min(created_at AT TIME ZONE 'UTC')) AS cw
  FROM erp_activity GROUP BY user_id
), cohort AS (SELECT user_id, cw FROM first WHERE cw >= :from_naive),
act AS (
  SELECT DISTINCT user_id, date_trunc('week', created_at AT TIME ZONE 'UTC') AS aw
  FROM erp_activity WHERE created_at >= :from_w AND created_at < :e
)
SELECT c.cw::date AS cohort, ((a.aw::date - c.cw::date) / 7)::int AS wk, count(*) AS n
FROM cohort c JOIN act a ON a.user_id = c.user_id AND a.aw >= c.cw
GROUP BY 1, 2
""")
_HEAT_SQL = text("""
SELECT extract(isodow FROM created_at AT TIME ZONE 'UTC')::int AS dow, extract(hour FROM created_at AT TIME ZONE 'UTC')::int AS hr, count(*) AS n
FROM erp_activity WHERE created_at >= :s AND created_at < :e GROUP BY 1, 2
""")


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_engagement_raw(s: datetime, e: datetime) -> dict[str, Any]:
    last_monday = (e - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    last_monday -= timedelta(days=last_monday.weekday())
    from_w = last_monday - timedelta(weeks=7)

    async def q(db: AsyncSession) -> dict[str, Any]:
        windows = {}
        for name, days in (("dau", 1), ("wau", 7), ("mau", 30)):
            windows[name] = (await db.execute(
                select(func.count(distinct(A.user_id))).where(_in(e - timedelta(days=days), e))
            )).scalar_one()
        heat = [tuple(r) for r in (await db.execute(_HEAT_SQL, {"s": s, "e": e})).all()]
        ret = [tuple(r) for r in (await db.execute(_RETENTION_SQL, {"from_w": from_w, "from_naive": from_w.replace(tzinfo=None), "e": e})).all()]
        return {"windows": windows, "heat": heat, "retention": ret, "fromWeek": from_w}

    return await _run(q)


async def engagement_detail(period: Period) -> dict[str, Any]:
    raw = await _erp_engagement_raw(period.start, period.end)
    w = raw["windows"]
    grid = [[0] * 24 for _ in range(7)]
    for dow, hr, n in raw["heat"]:
        grid[dow - 1][hr] = n
    by_cohort: dict[Any, dict[int, int]] = {}
    for cohort, wk, n in raw["retention"]:
        by_cohort.setdefault(cohort, {})[wk] = n
    last_week = (period.end - timedelta(days=1)).date()
    last_week -= timedelta(days=last_week.weekday())
    cohorts = []
    for cohort in sorted(by_cohort):
        size = by_cohort[cohort].get(0, 0)
        weeks_open = (last_week - cohort).days // 7
        cohorts.append({
            "week": cohort.isoformat(), "size": size,
            "retention": [_pct(by_cohort[cohort].get(i, 0), size) if size else None for i in range(weeks_open + 1)],
        })
    return {
        "period": period.describe(),
        "asOf": (period.end - timedelta(days=1)).date().isoformat(),
        "dau": w["dau"], "wau": w["wau"], "mau": w["mau"],
        "dauMau": _pct(w["dau"], w["mau"]) if w["mau"] else None,
        "wauMau": _pct(w["wau"], w["mau"]) if w["mau"] else None,
        "heatmap": grid, "heatmapTotal": sum(sum(r) for r in grid),
        "cohorts": cohorts,
    }


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_device_trend(s: datetime, e: datetime, unit: str) -> dict[tuple, int]:
    async def q(db: AsyncSession) -> dict[tuple, int]:
        b = _bucket_expr(A.created_at, unit)  # type: ignore[arg-type]
        dev = func.coalesce(A.device, "unknown")
        rows = (await db.execute(select(b.label("b"), dev, func.count(distinct(A.session_id))).where(_in(s, e)).group_by(b, dev))).all()
        return {(r[0], r[1]): r[2] for r in rows}

    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _erp_device_modules(s: datetime, e: datetime) -> list[tuple]:
    async def q(db: AsyncSession) -> list[tuple]:
        dev = func.coalesce(A.device, "unknown")
        rows = (await db.execute(select(A.module, dev, func.count()).where(_in(s, e)).group_by(A.module, dev))).all()
        return [tuple(r) for r in rows]

    return await _run(q)


async def devices_detail(period: Period) -> dict[str, Any]:
    s, e = period.start, period.end
    unit = default_group_by(period.days)
    devices, oses, browsers, trend, dev_mod = await asyncio.gather(
        _erp_by(s, e, "device"), _erp_by(s, e, "os"), _erp_by(s, e, "browser"), _erp_device_trend(s, e, unit), _erp_device_modules(s, e),
    )
    names = [r[0] for r in devices]
    per_module: dict[str, dict[str, int]] = {}
    for module, dev, n in dev_mod:
        per_module.setdefault(module, {})[dev] = n
    modules = sorted(per_module.items(), key=lambda kv: -sum(kv[1].values()))
    return {
        "period": period.describe(), "groupBy": unit, "deviceNames": names,
        "types": _mix(devices), "os": _mix(oses), "browsers": _mix(browsers),
        "series": [{"period": bucket_label(k, unit), **{d: trend.get((k, d), 0) for d in names}} for k in bucket_keys(period, unit)],
        "byModule": [
            {"module": m, "total": sum(v.values()), **{d: _pct(v.get(d, 0), sum(v.values())) for d in names}} for m, v in modules[:12]
        ],
    }
