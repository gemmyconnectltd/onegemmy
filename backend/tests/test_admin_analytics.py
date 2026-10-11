import asyncio
from datetime import UTC, date, datetime, timedelta

import pytest

from app.core import cache
from app.core.deps import get_current_active_superuser
from app.core.exceptions import ValidationError
from app.modules.admin import analytics

# ── Period resolution ─────────────────────────────────────────────────────────

def test_default_period_is_last_30_days_inclusive():
    p = analytics.resolve_period(None, None, today=date(2026, 10, 7))
    assert p.describe()["from"] == "2026-09-08"
    assert p.describe()["to"] == "2026-10-07"
    assert p.days == 30


def test_previous_period_is_same_length_and_adjacent():
    p = analytics.resolve_period(date(2026, 9, 1), date(2026, 9, 10))
    assert p.days == 10
    assert p.prev_end == p.start
    assert p.prev_end - p.prev_start == p.end - p.start
    assert p.describe()["previousFrom"] == "2026-08-22"
    assert p.describe()["previousTo"] == "2026-08-31"


def test_period_end_is_exclusive_midnight_after_to():
    p = analytics.resolve_period(date(2026, 9, 1), date(2026, 9, 1))
    assert p.end == datetime(2026, 9, 2, tzinfo=UTC)
    assert p.days == 1


def test_period_rejects_inverted_and_oversized_ranges():
    with pytest.raises(ValidationError):
        analytics.resolve_period(date(2026, 9, 2), date(2026, 9, 1))
    with pytest.raises(ValidationError):
        analytics.resolve_period(date(2010, 1, 1), date(2026, 1, 1))


@pytest.mark.parametrize(
    ("days", "expected"),
    [(1, "day"), (7, "day"), (31, "day"), (32, "week"), (92, "week"), (183, "month"), (366, "month"), (2000, "year")],
)
def test_default_group_by(days, expected):
    assert analytics.default_group_by(days) == expected


# ── Buckets ───────────────────────────────────────────────────────────────────

def test_day_buckets_cover_every_day():
    p = analytics.resolve_period(date(2026, 9, 28), date(2026, 10, 2))
    keys = analytics.bucket_keys(p, "day")
    assert [k.isoformat() for k in keys] == ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]


def test_week_buckets_start_on_monday():
    # 2026-10-07 is a Wednesday → its week starts Monday 2026-10-05.
    p = analytics.resolve_period(date(2026, 10, 7), date(2026, 10, 20))
    keys = analytics.bucket_keys(p, "week")
    assert keys[0] == date(2026, 10, 5)
    assert all(k.weekday() == 0 for k in keys)
    assert keys[-1] == date(2026, 10, 19)


def test_month_buckets_cross_year_boundary():
    p = analytics.resolve_period(date(2025, 11, 15), date(2026, 2, 3))
    keys = analytics.bucket_keys(p, "month")
    assert [analytics.bucket_label(k, "month") for k in keys] == ["2025-11", "2025-12", "2026-01", "2026-02"]


def test_year_buckets_and_labels():
    p = analytics.resolve_period(date(2024, 6, 1), date(2026, 1, 1))
    keys = analytics.bucket_keys(p, "year")
    assert [analytics.bucket_label(k, "year") for k in keys] == ["2024", "2025", "2026"]


def test_too_many_buckets_is_rejected():
    p = analytics.resolve_period(date(2020, 1, 1), date(2026, 1, 1))
    with pytest.raises(ValidationError):
        analytics.bucket_keys(p, "day")


# ── Metric maths ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    ("value", "previous", "expected"),
    [(112, 100, 12.0), (50, 100, -50.0), (0, 0, 0.0), (5, 0, None), (5, None, None), (None, 5, None)],
)
def test_change_pct(value, previous, expected):
    assert analytics.change_pct(value, previous) == expected


def test_insight_block_percentages_use_all_signups_as_denominator():
    # 10 signups: 7 Rwanda, 3 left the field blank.
    totals = {"total": 10, "known": 7, "distinct": 1}
    block = analytics._insight_block("country", totals, [("Rwanda", 7)])
    assert block["items"] == [{"name": "Rwanda", "count": 7, "pct": 70.0}]
    assert block["unknown"] == 3
    assert block["unknownPct"] == 30.0
    assert block["other"] is None
    assert block["hasMore"] is False


def test_insight_block_categories_other_and_unknown_add_up_to_100():
    totals = {"total": 120, "known": 100, "distinct": 4}
    block = analytics._insight_block("country", totals, [("Rwanda", 60), ("Kenya", 20)])
    assert block["other"] == {"count": 20, "pct": 16.7, "categories": 2}
    assert block["unknownPct"] == 16.7
    assert block["hasMore"] is True
    shown = sum(i["count"] for i in block["items"]) + block["other"]["count"] + block["unknown"]
    assert shown == block["total"]


def test_insight_block_with_no_signups_is_all_zero():
    block = analytics._insight_block("country", {"total": 0, "known": 0, "distinct": 0}, [])
    assert block["total"] == 0 and block["unknownPct"] == 0.0 and block["items"] == []


# ── Global tenant filters ─────────────────────────────────────────────────────

def test_empty_filter_is_inactive_and_has_no_conditions():
    f = analytics.TenantFilter()
    assert f.active is False
    assert f.conditions() == []


def test_filter_builds_one_condition_per_selected_dimension():
    f = analytics.TenantFilter(country="Rwanda", industry="Retail")
    assert f.active is True
    assert len(f.conditions()) == 2
    assert len(analytics.TenantFilter(country="Rwanda", industry="Retail", business_type="llc").conditions()) == 3


def test_filter_skip_drops_only_that_dimension():
    f = analytics.TenantFilter(country="Rwanda", industry="Retail")
    assert len(f.conditions(skip="country")) == 1
    assert len(f.conditions(skip="heard_about")) == 2  # not a filter dimension: nothing to skip
    assert f.value("country") == "Rwanda"
    assert f.value("heard_about") is None


def test_filter_is_hashable_for_cache_keys():
    a = analytics.TenantFilter(country="Rwanda")
    b = analytics.TenantFilter(country="Rwanda")
    assert a == b
    assert len({a, b, analytics.TenantFilter()}) == 2


def test_tenant_filter_dependency_treats_blank_values_as_unset():
    f = analytics.tenant_filter(country="", industry="Retail", business_type=None)
    assert f == analytics.TenantFilter(country=None, industry="Retail", business_type=None)


# ── Security ──────────────────────────────────────────────────────────────────

def test_every_analytics_route_requires_platform_superuser():
    deps = [d.dependency for d in analytics.router.dependencies]
    assert get_current_active_superuser in deps
    assert analytics.router.routes, "router should expose endpoints"


# ── TTL cache ─────────────────────────────────────────────────────────────────

async def test_ttl_cache_returns_cached_value_and_invalidates():
    calls = 0

    @cache.ttl_cache("test-ns-a", 60)
    async def compute(x: int) -> int:
        nonlocal calls
        calls += 1
        return x * 2

    assert await compute(2) == 4
    assert await compute(2) == 4
    assert calls == 1
    assert await compute(3) == 6
    assert calls == 2
    cache.invalidate_cache("test-ns-a")
    assert await compute(2) == 4
    assert calls == 3


async def test_ttl_cache_is_single_flight_under_concurrency():
    calls = 0

    @cache.ttl_cache("test-ns-b", 60)
    async def slow() -> str:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return "ok"

    results = await asyncio.gather(*[slow() for _ in range(10)])
    assert results == ["ok"] * 10
    assert calls == 1


async def test_ttl_cache_expires_and_supports_callable_ttl():
    calls = 0

    @cache.ttl_cache("test-ns-c", lambda x: 0.01)
    async def compute(x: int) -> int:
        nonlocal calls
        calls += 1
        return x

    await compute(1)
    await asyncio.sleep(0.03)
    await compute(1)
    assert calls == 2


async def test_ttl_cache_does_not_cache_failures():
    calls = 0

    @cache.ttl_cache("test-ns-d", 60)
    async def flaky() -> int:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("boom")
        return 1

    with pytest.raises(RuntimeError):
        await flaky()
    assert await flaky() == 1


def test_history_ttl_is_longer_for_past_ranges():
    now = datetime.now(UTC)
    live = analytics._history_ttl(now - timedelta(days=30), now + timedelta(days=1))
    past = analytics._history_ttl(now - timedelta(days=90), now - timedelta(days=30))
    assert past > live


def test_growth_ttl_skips_the_metric_argument():
    now = datetime.now(UTC)
    assert analytics._growth_ttl("tenants", now - timedelta(days=90), now - timedelta(days=30)) == analytics._HISTORY_TTL
    assert analytics._growth_ttl("users", now - timedelta(days=30), now + timedelta(days=1)) == analytics._LIVE_TTL
