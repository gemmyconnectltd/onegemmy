"""Platform-level (super-admin) analytics for the Platform Overview dashboard.

Everything is aggregated in the database (COUNT / SUM / GROUP BY with FILTER
clauses) — nothing loads tenant, user or order rows into Python — and every
response is bounded in size regardless of how many tenants exist.

Global filters (country / industry / business type) are *tenant* attributes.
They are applied in SQL by restricting tenants directly, or by joining users /
orders to `tenants` only when a filter is actually set (no join otherwise).
Filters are applied where they make business sense; each endpoint's docstring
says which ones it honours.

Each aggregate helper opens its own session so independent queries can run
concurrently, and is wrapped in a short TTL cache (app.core.cache) keyed on the
period *and* the filters. Tenant-management routes call
`invalidate_analytics_cache()` so approvals, suspensions and signups show up
immediately.

"Tenant Sales" is the sum of *Completed* order totals (VAT-inclusive gross sales,
a.k.a. GMV) — money the tenants' customers paid the tenants. It is NOT PESAA's
own revenue: PESAA has no subscription/fee billing data yet, so no such figure is
reported. Tenants keep books in different base currencies, so raw amounts are
never added together: each (tenant currency, day) bucket is converted into the
platform reporting currency at the platform rate in force that day, and the
response carries the original per-currency amounts alongside the converted total.
"""
import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, and_, cast, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache, ttl_cache
from app.core.database import AsyncSessionLocal
from app.core.deps import get_current_active_superuser
from app.core.exceptions import ValidationError
from app.core.response import paginated_response, success_response
from app.modules.currency.models import ExchangeRate
from app.modules.currency.reporting import RateBook, convert_daily
from app.modules.currency.service import get_reporting_currency
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant, User

CACHE_NS = "admin-analytics"

# Cache windows: live numbers briefly, slow-moving breakdowns longer, and
# historical (fully in the past) ranges much longer since they can't change.
_LIVE_TTL = 120.0
_INSIGHT_TTL = 600.0
_HISTORY_TTL = 3600.0

MAX_RANGE_DAYS = 3660
MAX_BUCKETS = 400
MAX_FILTER_OPTIONS = 200
DEFAULT_CURRENCY = "RWF"

GroupBy = Literal["day", "week", "month", "year"]
Dimension = Literal["country", "industry", "business_type", "heard_about"]
GrowthMetric = Literal["tenants", "users"]

router = APIRouter(
    prefix="/admin/analytics",
    tags=["Super Admin - Analytics"],
    # Applied to every route here: platform-wide data must never be reachable
    # by an ordinary (tenant) user, even if a route forgets its own check.
    dependencies=[Depends(get_current_active_superuser)],
)


def invalidate_analytics_cache() -> None:
    """Call after tenant create/approve/suspend/delete so counts refresh now."""
    invalidate_cache(CACHE_NS)


# ── Tenant status expressions ─────────────────────────────────────────────────
# Mirrors tenantStatusLabel() on the frontend: an inactive tenant that is still
# `subscription_status = "pending"` is a signup awaiting approval; any other
# inactive tenant was suspended after the fact.

_ACTIVE = Tenant.is_active.is_(True)
_PENDING = and_(Tenant.is_active.is_(False), func.coalesce(Tenant.subscription_status, "") == "pending")
_SUSPENDED = and_(Tenant.is_active.is_(False), func.coalesce(Tenant.subscription_status, "") != "pending")


# ── Global tenant filters ─────────────────────────────────────────────────────

_FILTER_COLUMNS: dict[str, Any] = {
    "country": Tenant.country,
    "industry": Tenant.industry,
    "business_type": Tenant.business_type,
}


@dataclass(frozen=True)
class TenantFilter:
    """Country / industry / business-type restriction on which tenants count.
    Hashable so it can be part of a cache key."""
    country: str | None = None
    industry: str | None = None
    business_type: str | None = None

    def value(self, dimension: str) -> str | None:
        return getattr(self, dimension, None)

    @property
    def active(self) -> bool:
        return any((self.country, self.industry, self.business_type))

    def conditions(self, skip: str | None = None) -> list[Any]:
        """SQL conditions on `tenants`. `skip` omits one dimension — used when a
        breakdown by that dimension would otherwise collapse to a single value
        (e.g. "by country" while a country is selected)."""
        return [
            col == self.value(dim)
            for dim, col in _FILTER_COLUMNS.items()
            if dim != skip and self.value(dim)
        ]


def tenant_filter(
    country: Annotated[str | None, Query(max_length=100)] = None,
    industry: Annotated[str | None, Query(max_length=100)] = None,
    business_type: Annotated[str | None, Query(alias="businessType", max_length=50)] = None,
) -> TenantFilter:
    return TenantFilter(country or None, industry or None, business_type or None)


FilterDep = Annotated[TenantFilter, Depends(tenant_filter)]


# ── Period handling ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Period:
    """Inclusive [from, to] dates → half-open UTC datetimes, plus the equally
    long period immediately before it (for "vs previous period" comparisons)."""
    start: datetime
    end: datetime
    prev_start: datetime
    prev_end: datetime

    @property
    def days(self) -> int:
        return (self.end - self.start).days

    def describe(self) -> dict[str, Any]:
        return {
            "from": self.start.date().isoformat(),
            "to": (self.end - timedelta(days=1)).date().isoformat(),
            "days": self.days,
            "previousFrom": self.prev_start.date().isoformat(),
            "previousTo": (self.prev_end - timedelta(days=1)).date().isoformat(),
        }


def resolve_period(from_: date | None, to: date | None, today: date | None = None) -> Period:
    today = today or datetime.now(UTC).date()
    to = to or today
    from_ = from_ or (to - timedelta(days=29))
    if from_ > to:
        raise ValidationError("`from` must be on or before `to`")
    if (to - from_).days + 1 > MAX_RANGE_DAYS:
        raise ValidationError(f"Date range cannot exceed {MAX_RANGE_DAYS} days")
    start = datetime(from_.year, from_.month, from_.day, tzinfo=UTC)
    end = datetime(to.year, to.month, to.day, tzinfo=UTC) + timedelta(days=1)
    span = end - start
    return Period(start=start, end=end, prev_start=start - span, prev_end=start)


def default_group_by(days: int) -> GroupBy:
    if days <= 31:
        return "day"
    if days <= 180:
        return "week"
    if days <= 1100:
        return "month"
    return "year"


def _bucket_start(d: date, unit: GroupBy) -> date:
    if unit == "day":
        return d
    if unit == "week":  # Postgres date_trunc('week') starts on Monday
        return d - timedelta(days=d.weekday())
    if unit == "month":
        return d.replace(day=1)
    return d.replace(month=1, day=1)


def _next_bucket(d: date, unit: GroupBy) -> date:
    if unit == "day":
        return d + timedelta(days=1)
    if unit == "week":
        return d + timedelta(days=7)
    if unit == "month":
        return date(d.year + (d.month // 12), d.month % 12 + 1, 1)
    return date(d.year + 1, 1, 1)


def bucket_label(d: date, unit: GroupBy) -> str:
    if unit == "month":
        return d.strftime("%Y-%m")
    if unit == "year":
        return d.strftime("%Y")
    return d.isoformat()


def bucket_keys(period: Period, unit: GroupBy) -> list[date]:
    """Every bucket start covering the period, so empty buckets still appear."""
    last = _bucket_start((period.end - timedelta(days=1)).date(), unit)
    cur = _bucket_start(period.start.date(), unit)
    keys: list[date] = []
    while cur <= last:
        keys.append(cur)
        if len(keys) > MAX_BUCKETS:
            raise ValidationError(f"Too many {unit} buckets for this range — choose a coarser grouping")
        cur = _next_bucket(cur, unit)
    return keys


def _bucket_expr(column: Any, unit: GroupBy) -> Any:
    return cast(func.date_trunc(unit, func.timezone("UTC", column)), Date)


def period_params(
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: Annotated[date | None, Query()] = None,
) -> Period:
    return resolve_period(from_, to)


PeriodDep = Annotated[Period, Depends(period_params)]


# ── Small helpers ─────────────────────────────────────────────────────────────

def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def change_pct(value: float | None, previous: float | None) -> float | None:
    """% change vs the previous period; None when there is no baseline to
    compare against (previous is missing, or zero while value is not)."""
    if value is None or previous is None:
        return None
    if previous == 0:
        return 0.0 if value == 0 else None
    return round((float(value) - float(previous)) / float(previous) * 100, 1)


def _metric(
    key: str, label: str, value: float, previous: float | None, *, scope: str, description: str,
    fmt: str = "number", currency: str | None = None, breakdown: list[dict] | None = None,
    href: str | None = None, extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "key": key, "label": label, "value": value, "previous": previous,
        "changePct": change_pct(value, previous),
        # "cumulative" = running total as of period end; "period" = only what
        # happened inside the period.
        "scope": scope, "description": description, "format": fmt,
    }
    if currency:
        out["currency"] = currency
    if breakdown is not None:
        out["breakdown"] = breakdown
    if href:
        out["href"] = href
    if extra:
        out.update(extra)
    return out


async def _run[T](fn: Callable[[AsyncSession], Awaitable[T]]) -> T:
    """Run one query function in its own session (safe to gather concurrently)."""
    async with AsyncSessionLocal() as db:
        return await fn(db)


def _history_ttl(_start: datetime, end: datetime, *_a: Any) -> float:
    return _HISTORY_TTL if end < datetime.now(UTC) - timedelta(days=1) else _LIVE_TTL


def _users_from(stmt: Any, filt: TenantFilter) -> Any:
    """Restrict a `users` select to tenant users, joining `tenants` only when a
    tenant filter needs it."""
    stmt = stmt.where(User.tenant_id.isnot(None))
    if filt.active:
        stmt = stmt.join(Tenant, Tenant.id == User.tenant_id).where(*filt.conditions())
    return stmt


# ── Cached aggregate queries ──────────────────────────────────────────────────

@ttl_cache(CACHE_NS, _history_ttl)
async def _tenant_stats(start: datetime, end: datetime, filt: TenantFilter) -> dict[str, int]:
    """One scan of `tenants` answers the tenant KPI and the status donut."""
    async def q(db: AsyncSession) -> dict[str, int]:
        c = Tenant.created_at
        row = (await db.execute(select(
            func.count().filter(c < end).label("total_end"),
            func.count().filter(c < start).label("total_prev"),
            func.count().filter(_ACTIVE).label("active_now"),
            func.count().filter(_PENDING).label("pending_now"),
            func.count().filter(_SUSPENDED).label("suspended_now"),
            func.count().label("all_now"),
        ).where(*filt.conditions()))).one()
        return dict(row._mapping)
    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _user_stats(start: datetime, end: datetime, filt: TenantFilter) -> dict[str, int]:
    async def q(db: AsyncSession) -> dict[str, int]:
        c = User.created_at
        stmt = select(
            func.count().filter(c < end).label("total_end"),
            func.count().filter(c < start).label("total_prev"),
        ).select_from(User)
        return dict((await db.execute(_users_from(stmt, filt))).one()._mapping)
    return await _run(q)


@ttl_cache(CACHE_NS, _history_ttl)
async def _order_stats(start: datetime, end: datetime, filt: TenantFilter) -> dict[str, int]:
    """Order counts for the period and the one before it, in a single indexed
    range scan on sales_orders.ordered_at."""
    prev_start = start - (end - start)

    async def q(db: AsyncSession) -> dict[str, int]:
        o = Order.ordered_at
        stmt = select(
            func.count().filter(o >= start).label("orders"),
            func.count().filter(o < start).label("orders_prev"),
        ).select_from(Order).where(o >= prev_start, o < end)
        if filt.active:
            stmt = stmt.join(Tenant, Tenant.id == Order.tenant_id).where(*filt.conditions())
        return dict((await db.execute(stmt)).one()._mapping)
    return await _run(q)


async def _rate_book(reporting: str, currencies: set[str], until: datetime) -> RateBook:
    """Platform-wide rates (tenant_id NULL) between the reporting currency and each of `currencies`."""
    book = RateBook(reporting)
    others = currencies - {reporting}
    if not others:
        return book.freeze()

    async def q(db: AsyncSession) -> list[ExchangeRate]:
        return list((await db.execute(
            select(ExchangeRate).where(
                ExchangeRate.tenant_id.is_(None), ExchangeRate.effective_at < until,
                ((ExchangeRate.base_currency.in_(others)) & (ExchangeRate.quote_currency == reporting))
                | ((ExchangeRate.quote_currency.in_(others)) & (ExchangeRate.base_currency == reporting)),
            )
        )).scalars().all())

    for r in await _run(q):
        book.add(r.base_currency, r.quote_currency, Decimal(r.rate), r.effective_at)
    return book.freeze()


def _round_money(d: Decimal | float, places: int = 2) -> float:
    return float(round(Decimal(str(d)), places))


@ttl_cache(CACHE_NS, _history_ttl)
async def _sales_summary(start: datetime, end: datetime, filt: TenantFilter) -> dict[str, Any]:
    """Completed-order sales for the period and the one before it, converted to the platform
    reporting currency day by day.

    One grouped query yields at most (days × tenant currencies) rows, however many orders exist.
    Order.base_total is already in each tenant's base currency (= Tenant.currency, frozen once
    transactions exist), so the only conversion left is tenant-currency → reporting currency.
    """
    prev_start = start - (end - start)

    async def rows_q(db: AsyncSession) -> list[tuple[str, date, Decimal]]:
        day = cast(func.date_trunc("day", func.timezone("UTC", Order.ordered_at)), Date)
        rows = (await db.execute(
            select(
                Tenant.currency.label("currency"), day.label("day"),
                func.coalesce(func.sum(func.coalesce(Order.base_total, Order.total)), 0).label("amount"),
            )
            .select_from(Order).join(Tenant, Tenant.id == Order.tenant_id)
            .where(Order.status == "Completed", Order.ordered_at >= prev_start, Order.ordered_at < end, *filt.conditions())
            .group_by(Tenant.currency, day)
        )).all()
        return [(r.currency or DEFAULT_CURRENCY, r.day, Decimal(r.amount)) for r in rows]

    reporting = await _run(get_reporting_currency)
    rows = await _run(rows_q)
    book = await _rate_book(reporting, {c for c, _, _ in rows}, end)

    start_day, end_day = start.date(), (end - timedelta(microseconds=1)).date()
    current = convert_daily([r for r in rows if start_day <= r[1] <= end_day], book)
    previous = convert_daily([r for r in rows if r[1] < start_day], book)

    breakdown = []
    for code, line in sorted(current.lines.items(), key=lambda kv: kv[1].original, reverse=True):
        breakdown.append({
            "currency": code,
            "originalAmount": _round_money(line.original),
            "convertedAmount": _round_money(line.converted) if (line.converted > 0 or line.fully_converted) else None,
            "missingRate": not line.fully_converted,
        })
    return {
        "reportingCurrency": reporting,
        "total": _round_money(current.total),
        "previous": _round_money(previous.total),
        "breakdown": breakdown,
        "missingRates": current.missing_rates,
        "partial": current.partial,
    }


# ── GET /overview ─────────────────────────────────────────────────────────────

@router.get("/overview")
async def analytics_overview(period: PeriodDep, filt: FilterDep):
    """The four headline KPIs with a previous-period comparison. Honours the
    date range and every tenant filter. Four aggregate queries, run concurrently."""
    s, e = period.start, period.end
    tenants, users, orders, sales = await asyncio.gather(
        _tenant_stats(s, e, filt), _user_stats(s, e, filt),
        _order_stats(s, e, filt), _sales_summary(s, e, filt),
    )
    currency = sales["reportingCurrency"]
    metrics = [
        _metric("totalTenants", "Total Tenants", tenants["total_end"], tenants["total_prev"], scope="cumulative",
                description="All tenants registered up to the end of the selected period (any status)."),
        _metric("totalUsers", "Total Users", users["total_end"], users["total_prev"], scope="cumulative",
                description="Users across tenants registered up to the end of the selected period."),
        _metric("totalOrders", "Total Orders", orders["orders"], orders["orders_prev"], scope="period",
                description="Orders placed during the selected period, any status."),
        _metric("tenantSales", "Tenant Sales", sales["total"], sales["previous"], scope="period", fmt="currency",
                currency=currency, breakdown=sales["breakdown"],
                extra={"missingRates": sales["missingRates"], "partial": sales["partial"]},
                description="Gross sales (VAT-inclusive, Completed orders) that tenants processed in the selected "
                            "period, converted to the platform reporting currency at each day's rate. This is "
                            "tenant sales volume, not PESAA's own revenue."),
    ]
    return success_response(data={
        "period": period.describe(),
        "currency": currency,
        "metrics": metrics,
        "generatedAt": datetime.now(UTC).isoformat(),
    }, message="Analytics overview retrieved")


# ── GET /growth ───────────────────────────────────────────────────────────────

def _growth_ttl(_metric: str, start: datetime, end: datetime, *_a: Any) -> float:
    return _history_ttl(start, end)


@ttl_cache(CACHE_NS, _growth_ttl)
async def _growth(metric: str, start: datetime, end: datetime, unit: GroupBy, filt: TenantFilter) -> list[dict[str, Any]]:
    keys = bucket_keys(Period(start=start, end=end, prev_start=start, prev_end=start), unit)
    created = Tenant.created_at if metric == "tenants" else User.created_at
    bucket = _bucket_expr(created, unit)

    def scoped(stmt: Any) -> Any:
        """Restrict to the tenants/users the global filters allow."""
        if metric == "tenants":
            return stmt.select_from(Tenant).where(*filt.conditions())
        return _users_from(stmt.select_from(User), filt)

    async def baseline(db: AsyncSession) -> int:
        return (await db.execute(scoped(select(func.count())).where(created < start))).scalar_one()

    async def per_bucket(db: AsyncSession) -> dict[date, int]:
        stmt = scoped(select(bucket.label("bucket"), func.count().label("n")))
        rows = (await db.execute(stmt.where(created >= start, created < end).group_by(bucket))).all()
        return {r.bucket: r.n for r in rows}

    total, by_bucket = await asyncio.gather(_run(baseline), _run(per_bucket))
    data = []
    for k in keys:
        new = by_bucket.get(k, 0)
        total += new
        data.append({"period": bucket_label(k, unit), "newCount": new, "totalCount": total})
    return data


@router.get("/growth")
async def analytics_growth(
    period: PeriodDep, filt: FilterDep,
    metric: Annotated[GrowthMetric, Query()] = "tenants",
    group_by: Annotated[GroupBy | None, Query(alias="groupBy")] = None,
):
    """New vs running-total tenants or users per bucket. Honours the date range
    and every tenant filter; the running total starts from everything created
    before the range so the line is the true total, not just the window's."""
    unit = group_by or default_group_by(period.days)
    data = await _growth(metric, period.start, period.end, unit, filt)
    return success_response(
        data={"metric": metric, "period": unit, "range": period.describe(), "data": data},
        message="Growth retrieved",
    )


# ── GET /platform-status ──────────────────────────────────────────────────────

async def _db_ping() -> dict[str, Any]:
    started = time.perf_counter()
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — any failure means the DB is not reachable
        return {"status": "down", "dbLatencyMs": None}
    ms = round((time.perf_counter() - started) * 1000, 1)
    return {"status": "operational" if ms < 1000 else "degraded", "dbLatencyMs": ms}


@router.get("/platform-status")
async def analytics_platform_status(period: PeriodDep, filt: FilterDep):
    """Tenant status mix right now (tenant filters apply; the date range does
    not — status has no history) plus a live database round-trip, the only
    system-health signal the backend can truthfully report."""
    tenants, system = await asyncio.gather(_tenant_stats(period.start, period.end, filt), _db_ping())
    return success_response(data={
        "tenants": {
            "total": tenants["all_now"],
            "active": tenants["active_now"],
            "suspended": tenants["suspended_now"],
            "pending": tenants["pending_now"],
        },
        "system": system,
    }, message="Platform status retrieved")


# ── GET /signup-insights ──────────────────────────────────────────────────────

_DIMENSIONS: dict[str, Any] = {
    "country": Tenant.country,
    "industry": Tenant.industry,
    "business_type": Tenant.business_type,
    "heard_about": Tenant.heard_about,
}


def _dim_expr(dimension: str) -> Any:
    # Empty strings count as "not provided", same as NULL. No btrim so the
    # tenants indexes on these columns stay usable.
    return func.nullif(_DIMENSIONS[dimension], "")


def _in_period(start: datetime, end: datetime) -> Any:
    return and_(Tenant.created_at >= start, Tenant.created_at < end)


@ttl_cache(CACHE_NS, _INSIGHT_TTL)
async def _insight_totals(start: datetime, end: datetime, dimension: str, filt: TenantFilter) -> dict[str, int]:
    async def q(db: AsyncSession) -> dict[str, int]:
        expr = _dim_expr(dimension)
        row = (await db.execute(select(
            func.count().label("total"),
            func.count(expr).label("known"),
            func.count(func.distinct(expr)).label("distinct"),
        ).where(_in_period(start, end), *filt.conditions(skip=dimension)))).one()
        return dict(row._mapping)
    return await _run(q)


@ttl_cache(CACHE_NS, _INSIGHT_TTL)
async def _insight_top(
    start: datetime, end: datetime, dimension: str, filt: TenantFilter, offset: int, limit: int,
) -> list[tuple[str, int]]:
    async def q(db: AsyncSession) -> list[tuple[str, int]]:
        expr = _dim_expr(dimension)
        rows = (await db.execute(
            select(expr.label("name"), func.count().label("cnt"))
            .where(_in_period(start, end), expr.isnot(None), *filt.conditions(skip=dimension))
            .group_by(expr).order_by(func.count().desc(), expr).offset(offset).limit(limit)
        )).all()
        return [(r.name, r.cnt) for r in rows]
    return await _run(q)


def _insight_block(dimension: str, totals: dict[str, int], top: list[tuple[str, int]]) -> dict[str, Any]:
    """Percentages are shares of *all* tenants registered in the period (under
    the active filters) — tenants that left the field blank count as `unknown`
    rather than silently vanishing from the denominator, so shown categories +
    Other + unknown always add up to 100%."""
    total = totals["total"]
    known = totals["known"]
    distinct = totals["distinct"]
    unknown = total - known
    other = known - sum(c for _, c in top)
    return {
        "key": dimension,
        "total": total,
        "known": known,
        "unknown": unknown,
        "unknownPct": _pct(unknown, total),
        "distinct": distinct,
        "items": [{"name": n, "count": c, "pct": _pct(c, total)} for n, c in top],
        # Everything beyond the top N, rolled up.
        "other": {"count": other, "pct": _pct(other, total), "categories": distinct - len(top)} if other > 0 else None,
        "hasMore": distinct > len(top),
    }


@router.get("/signup-insights")
async def analytics_signup_insights(
    dimension: Annotated[Dimension, Query()], period: PeriodDep, filt: FilterDep,
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
):
    """Top categories (+ rolled-up "Other") of one signup dimension among
    tenants registered in the period. Honours the date range and the tenant
    filters *except the one for this dimension*: a "by country" breakdown with
    Country = Rwanda selected would only ever say "Rwanda 100%", so that one
    filter is ignored here (and flagged via `ignoredFilter`)."""
    totals, top = await asyncio.gather(
        _insight_totals(period.start, period.end, dimension, filt),
        _insight_top(period.start, period.end, dimension, filt, 0, limit),
    )
    block = _insight_block(dimension, totals, top)
    return success_response(data={
        "range": period.describe(),
        "totalTenants": totals["total"],
        "ignoredFilter": dimension if filt.value(dimension) else None,
        **block,
    }, message="Signup insights retrieved")


@router.get("/signup-insights/all")
async def analytics_signup_insight_all(
    dimension: Annotated[Dimension, Query()], period: PeriodDep, filt: FilterDep,
    page: Annotated[int, Query(ge=1)] = 1, page_size: Annotated[int, Query(ge=1, le=100)] = 25,
):
    """'View all' drill-down: the full, paginated category list for one dimension."""
    totals = await _insight_totals(period.start, period.end, dimension, filt)
    rows = await _insight_top(period.start, period.end, dimension, filt, (page - 1) * page_size, page_size)
    items = [{"name": n, "count": c, "pct": _pct(c, totals["total"])} for n, c in rows]
    return paginated_response(
        items=items, total=totals["distinct"], page=page, page_size=page_size,
        message="Signup insight detail retrieved",
    )


# ── GET /recent-tenants ───────────────────────────────────────────────────────

@ttl_cache(CACHE_NS, _LIVE_TTL)
async def _recent_tenants(filt: TenantFilter, limit: int) -> list[dict[str, Any]]:
    async def q(db: AsyncSession) -> list[dict[str, Any]]:
        # Column select, not select(Tenant): the model eager-loads users/roles/
        # branches/departments via selectin, which would drag child tables in.
        rows = (await db.execute(
            select(
                Tenant.id, Tenant.name, Tenant.slug, Tenant.subscription_plan, Tenant.subscription_status,
                Tenant.is_active, Tenant.country, Tenant.created_at,
            ).where(*filt.conditions()).order_by(Tenant.created_at.desc(), Tenant.id).limit(limit)
        )).all()
        return [{
            "id": str(r.id), "name": r.name, "slug": r.slug, "plan": r.subscription_plan,
            "status": "Active" if r.is_active else ("Pending Approval" if r.subscription_status == "pending" else "Suspended"),
            "country": r.country,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        } for r in rows]
    return await _run(q)


@router.get("/recent-tenants")
async def analytics_recent_tenants(filt: FilterDep, limit: Annotated[int, Query(ge=1, le=10)] = 5):
    """The newest registrations. Honours the tenant filters; not the date range —
    "recent" means the latest joiners, not those inside an arbitrary window."""
    return success_response(data={"items": await _recent_tenants(filt, limit)}, message="Recent tenants retrieved")


# ── GET /filter-options ───────────────────────────────────────────────────────

@ttl_cache(CACHE_NS, _INSIGHT_TTL)
async def _filter_options(filt: TenantFilter) -> dict[str, list[dict[str, Any]]]:
    """Distinct values (with tenant counts) for each filter dropdown. Dependent:
    each list is narrowed by the *other* selected filters but not its own, so
    the selected value never hides its siblings."""
    async def one(dim: str) -> list[dict[str, Any]]:
        async def q(db: AsyncSession) -> list[dict[str, Any]]:
            expr = _dim_expr(dim)
            rows = (await db.execute(
                select(expr.label("value"), func.count().label("n"))
                .where(expr.isnot(None), *filt.conditions(skip=dim))
                .group_by(expr).order_by(func.count().desc(), expr).limit(MAX_FILTER_OPTIONS)
            )).all()
            return [{"value": r.value, "count": r.n} for r in rows]
        return await _run(q)

    countries, industries, business_types = await asyncio.gather(
        one("country"), one("industry"), one("business_type"),
    )
    return {"countries": countries, "industries": industries, "businessTypes": business_types}


@router.get("/filter-options")
async def analytics_filter_options(filt: FilterDep):
    """Values for the Country / Industry / Business Type dropdowns, straight
    from the tenants table so new values appear automatically."""
    return success_response(data=await _filter_options(filt), message="Filter options retrieved")


# ── Converted all-time figures for the older admin endpoints ──────────────────

_ALL_TIME_START = datetime(2000, 1, 1, tzinfo=UTC)


async def all_time_sales_converted() -> dict[str, Any]:
    """Platform-wide tenant sales since the beginning, in the reporting currency — what
    /admin/stats reports. Same conversion as the overview card; never a raw cross-currency sum."""
    tomorrow = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    s = await _sales_summary(_ALL_TIME_START, tomorrow, TenantFilter())
    return {"reporting_currency": s["reportingCurrency"], "total": s["total"], "partial": s["partial"], "missing_rates": s["missingRates"]}


@ttl_cache(CACHE_NS, _LIVE_TTL)
async def all_time_sales_by_plan() -> dict[str, Any]:
    """Tenant sales per subscription plan since the beginning, converted to the reporting currency."""
    tomorrow = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)

    async def q(db: AsyncSession) -> list[tuple[str, str, date, Decimal]]:
        day = cast(func.date_trunc("day", func.timezone("UTC", Order.ordered_at)), Date)
        rows = (await db.execute(
            select(
                Tenant.subscription_plan, Tenant.currency, day,
                func.coalesce(func.sum(func.coalesce(Order.base_total, Order.total)), 0),
            )
            .select_from(Order).join(Tenant, Tenant.id == Order.tenant_id)
            .where(Order.status == "Completed", Order.ordered_at < tomorrow)
            .group_by(Tenant.subscription_plan, Tenant.currency, day)
        )).all()
        return [(p, c or DEFAULT_CURRENCY, d, Decimal(a)) for p, c, d, a in rows]

    reporting = await _run(get_reporting_currency)
    rows = await _run(q)
    book = await _rate_book(reporting, {c for _, c, _, _ in rows}, tomorrow)
    by_plan: dict[str, list[tuple[str, date, Decimal]]] = {}
    for plan, cur, d, amount in rows:
        by_plan.setdefault(plan, []).append((cur, d, amount))
    converted = {plan: convert_daily(r, book) for plan, r in by_plan.items()}
    return {
        "reporting_currency": reporting,
        "by_plan": {plan: _round_money(c.total) for plan, c in converted.items()},
        "partial": any(c.partial for c in converted.values()),
    }
