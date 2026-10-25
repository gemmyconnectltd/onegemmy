"""Website Traffic report: how visitors find Pesaa, sign up and become paying customers.

Definitions (also surfaced in the API response so the UI never has to guess):
- Visitors: distinct anonymous `visitor_id`s with a page view in the period.
- Signups: tenants created in the period (all of them, tracked or not).
- Activated: signups that have recorded at least one *Completed* sales order.
- Paying customer: a tenant whose first *succeeded*, non-zero billing payment falls in the period.
- Attribution is first-touch: a signup is linked to a tracked visit only when its browser sent a `visitor_id`
  at registration that matches stored page views; the landing page / source / campaign come from that
  visitor's first page view. Signups without a match are counted but never attributed.
"""
import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import distinct, exists, func, select, text
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
from app.modules.billing.models import BillingPayment
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant
from app.modules.traffic.classify import CHANNELS
from app.modules.traffic.models import WebsiteVisit

TOP_LIMIT = 10


def _first_paid():
    """tenant_id → time of its first succeeded, non-zero payment."""
    return (
        select(BillingPayment.tenant_id, func.min(BillingPayment.created_at).label("fp"))
        .where(BillingPayment.status == "succeeded", BillingPayment.amount > 0)
        .group_by(BillingPayment.tenant_id)
        .subquery()
    )


def _in(col: Any, s: datetime, e: datetime) -> Any:
    return (col >= s) & (col < e)


@ttl_cache(CACHE_NS, _history_ttl)
async def _totals(s: datetime, e: datetime) -> dict[str, int]:
    """Headline counts for one window."""
    fp = _first_paid()

    async def q(db: AsyncSession) -> dict[str, int]:
        visitors = (await db.execute(
            select(func.count(distinct(WebsiteVisit.visitor_id))).where(_in(WebsiteVisit.created_at, s, e))
        )).scalar_one()
        signups = (await db.execute(select(func.count()).select_from(Tenant).where(_in(Tenant.created_at, s, e)))).scalar_one()
        has_visit = exists().where(WebsiteVisit.visitor_id == Tenant.attribution_visitor_id)
        paying = (await db.execute(
            select(func.count(), func.count().filter(has_visit))
            .select_from(fp).join(Tenant, Tenant.id == fp.c.tenant_id).where(_in(fp.c.fp, s, e))
        )).one()
        return {"visitors": visitors, "signups": signups, "paying": paying[0], "payingTracked": paying[1]}

    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _funnel_cohort(s: datetime, e: datetime) -> dict[str, int]:
    """Of the businesses that signed up in the window: how many activated, how many ever paid, how many matched a visit."""
    fp = _first_paid()

    async def q(db: AsyncSession) -> dict[str, int]:
        completed = exists().where(Order.tenant_id == Tenant.id, Order.status == "Completed")
        tracked = exists().where(WebsiteVisit.visitor_id == Tenant.attribution_visitor_id)
        row = (await db.execute(
            select(
                func.count(),
                func.count().filter(completed),
                func.count().filter(fp.c.tenant_id.isnot(None)),
                func.count().filter(tracked),
            ).select_from(Tenant).outerjoin(fp, fp.c.tenant_id == Tenant.id).where(_in(Tenant.created_at, s, e))
        )).one()
        return {"signups": row[0], "activated": row[1], "paying": row[2], "tracked": row[3]}

    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _trend(s: datetime, e: datetime, unit: str) -> dict[Any, dict[str, int]]:
    fp = _first_paid()

    async def visitors(db: AsyncSession) -> dict:
        b = _bucket_expr(WebsiteVisit.created_at, unit)  # type: ignore[arg-type]
        rows = (await db.execute(
            select(b.label("b"), func.count(distinct(WebsiteVisit.visitor_id)))
            .where(_in(WebsiteVisit.created_at, s, e)).group_by(b)
        )).all()
        return {r[0]: r[1] for r in rows}

    async def signups(db: AsyncSession) -> dict:
        b = _bucket_expr(Tenant.created_at, unit)  # type: ignore[arg-type]
        rows = (await db.execute(select(b.label("b"), func.count()).where(_in(Tenant.created_at, s, e)).group_by(b))).all()
        return {r[0]: r[1] for r in rows}

    async def paying(db: AsyncSession) -> dict:
        b = _bucket_expr(fp.c.fp, unit)  # type: ignore[arg-type]
        rows = (await db.execute(select(b.label("b"), func.count()).where(_in(fp.c.fp, s, e)).group_by(b))).all()
        return {r[0]: r[1] for r in rows}

    v, sg, p = await asyncio.gather(_run(visitors), _run(signups), _run(paying))
    keys = set(v) | set(sg) | set(p)
    return {k: {"visitors": v.get(k, 0), "signups": sg.get(k, 0), "paying": p.get(k, 0)} for k in keys}


@ttl_cache(CACHE_NS, _history_ttl)
async def _visit_breakdowns(s: datetime, e: datetime) -> dict[str, list[tuple]]:
    async def sources(db: AsyncSession) -> list[tuple]:
        rows = (await db.execute(
            select(WebsiteVisit.channel, func.count(distinct(WebsiteVisit.visitor_id)))
            .where(_in(WebsiteVisit.created_at, s, e)).group_by(WebsiteVisit.channel)
        )).all()
        return [tuple(r) for r in rows]

    async def pages(db: AsyncSession) -> list[tuple]:
        rows = (await db.execute(
            select(WebsiteVisit.path, func.count(distinct(WebsiteVisit.visitor_id)).label("n"))
            .where(_in(WebsiteVisit.created_at, s, e)).group_by(WebsiteVisit.path)
            .order_by(text("n DESC"), WebsiteVisit.path).limit(50)
        )).all()
        return [tuple(r) for r in rows]

    async def campaigns(db: AsyncSession) -> list[tuple]:
        rows = (await db.execute(
            select(WebsiteVisit.utm_campaign, func.count(distinct(WebsiteVisit.visitor_id)).label("n"))
            .where(_in(WebsiteVisit.created_at, s, e), WebsiteVisit.utm_campaign.isnot(None))
            .group_by(WebsiteVisit.utm_campaign).order_by(text("n DESC"), WebsiteVisit.utm_campaign).limit(50)
        )).all()
        return [tuple(r) for r in rows]

    a, b, c = await asyncio.gather(_run(sources), _run(pages), _run(campaigns))
    return {"sources": a, "pages": b, "campaigns": c}


_ATTRIBUTION_SQL = text("""
WITH cohort AS (
  SELECT t.id, t.attribution_visitor_id AS vid
  FROM tenants t
  WHERE t.created_at >= :s AND t.created_at < :e AND t.attribution_visitor_id IS NOT NULL
), ft AS (
  SELECT DISTINCT ON (v.visitor_id) v.visitor_id, v.path, v.channel, v.utm_source, v.utm_medium, v.utm_campaign
  FROM website_visits v JOIN cohort c ON c.vid = v.visitor_id
  ORDER BY v.visitor_id, v.created_at ASC
), paid AS (
  SELECT tenant_id FROM billing_payments WHERE status = 'succeeded' AND amount > 0 GROUP BY tenant_id
)
SELECT ft.path, ft.channel, ft.utm_source, ft.utm_medium, ft.utm_campaign,
       count(*) AS signups, count(p.tenant_id) AS paying
FROM cohort c
JOIN ft ON ft.visitor_id = c.vid
LEFT JOIN paid p ON p.tenant_id = c.id
GROUP BY ft.path, ft.channel, ft.utm_source, ft.utm_medium, ft.utm_campaign
""")


@ttl_cache(CACHE_NS, _history_ttl)
async def _attributed(s: datetime, e: datetime) -> list[tuple]:
    """Signups (and how many of them ever paid) by first-touch landing page / channel / source / medium / campaign."""
    async def q(db: AsyncSession) -> list[tuple]:
        return [tuple(r) for r in (await db.execute(_ATTRIBUTION_SQL, {"s": s, "e": e})).all()]

    return await _run(q)


def _credit(rows: list[tuple], key: int | tuple[int, ...]) -> dict[Any, list[int]]:
    """Sum attributed [signups, paying] by one column (or a tuple of columns) of an `_attributed` row."""
    out: dict[Any, list[int]] = {}
    for r in rows:
        k = tuple(r[i] for i in key) if isinstance(key, tuple) else r[key]
        acc = out.setdefault(k, [0, 0])
        acc[0] += r[5]
        acc[1] += r[6]
    return out


def _stat(value: int | None, previous: int | None, **extra: Any) -> dict[str, Any]:
    return {"value": value, "previous": previous, "changePct": change_pct(value, previous), **extra}


async def traffic_report(period: Period) -> dict[str, Any]:
    s, e = period.start, period.end
    unit = default_group_by(period.days)
    prev_period = Period(start=period.prev_start, end=period.prev_end, prev_start=period.prev_start, prev_end=period.prev_start)
    cur, prev, cohort, trend, prev_trend, visits, attributed = await asyncio.gather(
        _totals(s, e), _totals(period.prev_start, period.prev_end), _funnel_cohort(s, e),
        _trend(s, e, unit), _trend(period.prev_start, period.prev_end, unit), _visit_breakdowns(s, e), _attributed(s, e),
    )
    tracking = cur["visitors"] > 0 or prev["visitors"] > 0

    # KPIs. The conversion rate only counts paying customers that were matched to a tracked visit, so it never
    # credits the website for customers it cannot prove it brought in.
    rate = round(cur["payingTracked"] / cur["visitors"] * 100, 2) if cur["visitors"] else None
    prev_rate = round(prev["payingTracked"] / prev["visitors"] * 100, 2) if prev["visitors"] else None
    kpis = {
        "visitors": _stat(cur["visitors"], prev["visitors"]),
        "signups": _stat(cur["signups"], prev["signups"]),
        "paying": _stat(cur["paying"], prev["paying"], tracked=cur["payingTracked"]),
        "conversionRate": _stat(rate, prev_rate, tracked=cur["payingTracked"]),
    }

    keys = bucket_keys(period, unit)
    prev_keys = bucket_keys(prev_period, unit)
    empty = {"visitors": 0, "signups": 0, "paying": 0}
    series = []
    for i, k in enumerate(keys):
        row = {"period": bucket_label(k, unit), **trend.get(k, empty)}
        # The previous period lined up bucket-for-bucket (day 1 against day 1); None where it is shorter.
        if i < len(prev_keys):
            pk = prev_keys[i]
            row["previousPeriod"] = bucket_label(pk, unit)
            row["previous"] = prev_trend.get(pk, empty)
        else:
            row["previousPeriod"], row["previous"] = None, None
        series.append(row)

    funnel = [
        {"key": "visitors", "label": "Website visitors", "count": cur["visitors"]},
        {"key": "signups", "label": "Business signups", "count": cohort["signups"]},
        {"key": "activated", "label": "Activated businesses", "count": cohort["activated"]},
        {"key": "paying", "label": "Paying customers", "count": cohort["paying"]},
    ]
    for i, stage in enumerate(funnel):
        before = funnel[i - 1]["count"] if i else None
        stage["pctOfPrevious"] = _pct(stage["count"], before) if before else None
        stage["dropOff"] = max(before - stage["count"], 0) if before is not None else None

    by_channel = dict(visits["sources"])
    total_sources = sum(by_channel.values())
    sources = [
        {"channel": c, "visitors": by_channel.get(c, 0), "pct": _pct(by_channel.get(c, 0), total_sources)}
        for c in CHANNELS
    ]

    page_signups = _credit(attributed, 0)
    camp_signups = _credit([r for r in attributed if r[4]], 4)

    pages = [
        {"path": p, "visitors": v, "signups": page_signups.get(p, [0, 0])[0],
         "conversionRate": _pct(page_signups.get(p, [0, 0])[0], v)}
        for p, v in visits["pages"][:TOP_LIMIT]
    ]
    camp_names = {c for c, _ in visits["campaigns"]} | set(camp_signups)
    camp_visitors = dict(visits["campaigns"])
    campaigns = sorted((
        {"campaign": c, "visitors": camp_visitors.get(c, 0), "signups": camp_signups.get(c, [0, 0])[0],
         "paying": camp_signups.get(c, [0, 0])[1],
         "conversionRate": _pct(camp_signups.get(c, [0, 0])[1], camp_visitors.get(c, 0))}
        for c in camp_names
    ), key=lambda r: (-r["visitors"], r["campaign"]))[:TOP_LIMIT]

    return {
        "period": period.describe(),
        "groupBy": unit,
        "trackingActive": tracking,
        "kpis": kpis,
        "series": series,
        "funnel": funnel,
        "funnelNote": {"signupsTracked": cohort["tracked"], "signupsTotal": cohort["signups"]},
        "sources": sources,
        "pages": pages,
        "campaigns": campaigns,
        "generatedAt": datetime.now(UTC).isoformat(),
    }



async def realtime_report() -> dict[str, Any]:
    """Live view: visitors in the last 30 minutes, the last 48 hours hour by hour, and what they are reading now."""
    now = datetime.now(UTC)
    hour = func.date_trunc("hour", func.timezone("UTC", WebsiteVisit.created_at))
    since_48h = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=47)
    since_30m = now - timedelta(minutes=30)

    async def q(db: AsyncSession) -> tuple:
        active = (await db.execute(
            select(func.count(distinct(WebsiteVisit.visitor_id))).where(WebsiteVisit.created_at >= since_30m)
        )).scalar_one()
        total = (await db.execute(
            select(func.count(distinct(WebsiteVisit.visitor_id))).where(WebsiteVisit.created_at >= since_48h)
        )).scalar_one()
        hourly = (await db.execute(
            select(hour.label("h"), func.count(distinct(WebsiteVisit.visitor_id)))
            .where(WebsiteVisit.created_at >= since_48h).group_by(hour)
        )).all()
        pages = (await db.execute(
            select(WebsiteVisit.path, func.count(distinct(WebsiteVisit.visitor_id)).label("n"))
            .where(WebsiteVisit.created_at >= since_30m).group_by(WebsiteVisit.path)
            .order_by(text("n DESC"), WebsiteVisit.path).limit(5)
        )).all()
        return active, total, hourly, pages

    active, total, hourly, pages = await _run(q)
    by_hour = {h.replace(tzinfo=UTC): n for h, n in hourly}
    hours = [since_48h + timedelta(hours=i) for i in range(48)]
    return {
        "activeNow": active,
        "last48Hours": total,
        "hourly": [{"hour": h.isoformat(), "visitors": by_hour.get(h, 0)} for h in hours],
        "activePages": [{"path": p, "visitors": n} for p, n in pages],
        "generatedAt": now.isoformat(),
    }


# ── Detail pages ──────────────────────────────────────────────────────────────

DETAIL_LIMIT = 500


@ttl_cache(CACHE_NS, _history_ttl)
async def _detail_visits(s: datetime, e: datetime, dims: tuple[str, ...]) -> list[tuple]:
    """Distinct visitors and page views by the given WebsiteVisit columns."""
    cols = [getattr(WebsiteVisit, d) for d in dims]

    async def q(db: AsyncSession) -> list[tuple]:
        rows = (await db.execute(
            select(*cols, func.count(distinct(WebsiteVisit.visitor_id)).label("n"), func.count().label("views"))
            .where(_in(WebsiteVisit.created_at, s, e)).group_by(*cols).order_by(text("n DESC")).limit(DETAIL_LIMIT)
        )).all()
        return [tuple(r) for r in rows]

    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _channel_trend(s: datetime, e: datetime, unit: str) -> dict[tuple, int]:
    async def q(db: AsyncSession) -> dict[tuple, int]:
        b = _bucket_expr(WebsiteVisit.created_at, unit)  # type: ignore[arg-type]
        rows = (await db.execute(
            select(b.label("b"), WebsiteVisit.channel, func.count(distinct(WebsiteVisit.visitor_id)))
            .where(_in(WebsiteVisit.created_at, s, e)).group_by(b, WebsiteVisit.channel)
        )).all()
        return {(r[0], r[1]): r[2] for r in rows}

    return await _run(q)


async def sources_detail(period: Period) -> dict[str, Any]:
    s, e = period.start, period.end
    unit = default_group_by(period.days)
    by_channel, hosts, attributed, trend = await asyncio.gather(
        _detail_visits(s, e, ("channel",)), _detail_visits(s, e, ("channel", "referrer_host")),
        _attributed(s, e), _channel_trend(s, e, unit),
    )
    credit = _credit(attributed, 1)
    stats = {c: (n, views) for c, n, views in by_channel}
    total = sum(n for n, _ in stats.values())
    channels = [
        {"channel": c, "visitors": stats.get(c, (0, 0))[0], "views": stats.get(c, (0, 0))[1],
         "pct": _pct(stats.get(c, (0, 0))[0], total),
         "signups": credit.get(c, [0, 0])[0], "paying": credit.get(c, [0, 0])[1],
         "conversionRate": _pct(credit.get(c, [0, 0])[0], stats.get(c, (0, 0))[0])}
        for c in CHANNELS
    ]
    series = [
        {"period": bucket_label(k, unit), **{c: trend.get((k, c), 0) for c in CHANNELS}} for k in bucket_keys(period, unit)
    ]
    return {
        "period": period.describe(), "groupBy": unit, "channels": channels, "series": series,
        "referrers": [
            {"host": h, "channel": c, "visitors": n, "views": v} for c, h, n, v in hosts if h
        ][:50],
        "totalVisitors": total,
        "signupsTracked": sum(v[0] for v in credit.values()),
    }


async def pages_detail(period: Period) -> dict[str, Any]:
    s, e = period.start, period.end
    pages, attributed = await asyncio.gather(_detail_visits(s, e, ("path",)), _attributed(s, e))
    credit = _credit(attributed, 0)
    return {
        "period": period.describe(),
        "pages": [
            {"path": p, "visitors": n, "views": v, "signups": credit.get(p, [0, 0])[0], "paying": credit.get(p, [0, 0])[1],
             "conversionRate": _pct(credit.get(p, [0, 0])[0], n)}
            for p, n, v in pages
        ],
        "truncated": len(pages) >= DETAIL_LIMIT,
    }


async def campaigns_detail(period: Period) -> dict[str, Any]:
    s, e = period.start, period.end
    camps, combos, attributed = await asyncio.gather(
        _detail_visits(s, e, ("utm_campaign",)), _detail_visits(s, e, ("utm_campaign", "utm_source", "utm_medium")),
        _attributed(s, e),
    )
    by_camp = _credit([r for r in attributed if r[4]], 4)
    by_combo = _credit([r for r in attributed if r[4]], (4, 2, 3))
    return {
        "period": period.describe(),
        "campaigns": [
            {"campaign": c, "visitors": n, "views": v, "signups": by_camp.get(c, [0, 0])[0], "paying": by_camp.get(c, [0, 0])[1],
             "conversionRate": _pct(by_camp.get(c, [0, 0])[1], n)}
            for c, n, v in camps if c
        ],
        "sources": [
            {"campaign": c, "source": src, "medium": med, "visitors": n, "views": v,
             "signups": by_combo.get((c, src, med), [0, 0])[0], "paying": by_combo.get((c, src, med), [0, 0])[1]}
            for c, src, med, n, v in combos if c
        ],
        "truncated": len(camps) >= DETAIL_LIMIT,
    }
