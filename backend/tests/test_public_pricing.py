import pytest
from sqlalchemy import select

from app.modules.billing.models import BillingPlan, BillingPrice
from app.modules.billing.public import build_pricing
from app.modules.billing.schemas import PriceTerms
from app.modules.tenants.models.feature import FeatureFlag


def _terms(currency: str, monthly: int, annual: int, **kw) -> dict:
    return {"currency": currency, "monthly": monthly, "annual": annual, "seat_monthly": 0, "branch_monthly": 0, "included_users": 1, "included_branches": 1,
            "max_users": None, "max_branches": None, "max_products": None, "max_storage_mb": None, "modules": [], "trial_days": 0, "tax_bps": 0,
            "bill_active_users": False, **kw}


@pytest.mark.db
async def test_public_pricing_shows_only_active_plans_at_their_current_version(db):
    # Other plans may already exist (the seeded catalogue); only the "T-" plans created here are examined.
    flag = FeatureFlag(key="test_pos_module", name="Point of Sale (test)", module="sales")
    db.add(flag)
    cheap = BillingPlan(name="T-Starter", description="For one shop", status="active", version=2)
    dear = BillingPlan(name="T-Business", description="", status="active", version=1)
    draft, archived = BillingPlan(name="T-Draft plan", status="draft", version=1), BillingPlan(name="T-Old plan", status="archived", version=1)
    db.add_all([cheap, dear, draft, archived])
    await db.flush()
    db.add_all([
        BillingPrice(plan_id=cheap.id, version=1, currency="RWF", terms=_terms("RWF", 9999, 99999)),  # superseded version must not leak
        BillingPrice(plan_id=cheap.id, version=2, currency="RWF", terms=_terms("RWF", 15000, 144000, included_users=3, max_users=5, modules=["test_pos_module", "unnamed_module"], trial_days=14)),
        BillingPrice(plan_id=cheap.id, version=2, currency="USD", terms=_terms("USD", 1200, 11520)),
        BillingPrice(plan_id=dear.id, version=1, currency="RWF", terms=_terms("RWF", 45000, 432000, tax_bps=1800)),
        BillingPrice(plan_id=draft.id, version=1, currency="RWF", terms=_terms("RWF", 1, 1)),
        BillingPrice(plan_id=archived.id, version=1, currency="RWF", terms=_terms("RWF", 2, 2)),
    ])
    await db.flush()

    data = await build_pricing(db)
    mine = [p for p in data["plans"] if p["name"].startswith("T-")]
    assert [p["name"] for p in mine] == ["T-Starter", "T-Business"]  # cheapest first; draft and archived plans are hidden
    starter = mine[0]
    assert starter["prices"]["RWF"]["monthly"] == 15000 and starter["prices"]["RWF"]["annual"] == 144000  # the current version, in minor units
    assert starter["prices"]["USD"]["monthly"] == 1200  # USD is stored in cents
    assert (starter["prices"]["RWF"]["includedUsers"], starter["prices"]["RWF"]["maxUsers"], starter["prices"]["RWF"]["trialDays"]) == (3, 5, 14)
    assert {m["key"]: m["name"] for m in starter["modules"]} == {"test_pos_module": "Point of Sale (test)", "unnamed_module": "Unnamed Module"}
    assert mine[1]["prices"]["RWF"]["taxBps"] == 1800
    assert "terms" not in starter and "version" not in starter


def _migration():
    import importlib.util
    from pathlib import Path

    path = next((Path(__file__).resolve().parent.parent / "alembic" / "versions").glob("f9c3d7a52e18_*.py"))
    spec = importlib.util.spec_from_file_location("seed_pricing_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.db
async def test_pricing_seed_content_is_valid_and_matches_the_agreed_prices(db):
    mig = _migration()
    before = {p.id for p in (await db.execute(select(BillingPlan))).scalars().all()}
    assert await db.run_sync(lambda s: mig.seed_plans(s.connection(), force=True)) == 4
    new = [p for p in (await db.execute(select(BillingPlan))).scalars().all() if p.id not in before]
    by_name = {p.name: p for p in new}
    assert list(by_name) and set(by_name) == {"Launch", "Starter", "Growth", "Professional"} and all(p.status == "active" and p.version == 1 for p in new)
    prices = {(p.id, r.currency): PriceTerms.model_validate(r.terms) for p in new for r in (await db.execute(select(BillingPrice).where(BillingPrice.plan_id == p.id))).scalars().all()}
    t = lambda name, cur: prices[(by_name[name].id, cur)]
    assert [(t(n, "RWF").monthly, t(n, "RWF").annual) for n in ("Launch", "Starter", "Growth", "Professional")] == [(15000, 144000), (45000, 432000), (125000, 1200000), (250000, 2400000)]
    assert [(t(n, "USD").monthly, t(n, "USD").annual) for n in ("Launch", "Starter", "Growth", "Professional")] == [(3000, 28800), (5000, 48000), (10000, 96000), (20000, 192000)]  # cents
    assert (t("Starter", "RWF").max_users, t("Starter", "RWF").max_branches, t("Growth", "RWF").max_users, t("Professional", "RWF").max_users) == (4, 3, 20, 100)
    assert all(t(n, "RWF").annual < t(n, "RWF").monthly * 12 for n in by_name)  # yearly is cheaper than twelve months


@pytest.mark.db
async def test_pricing_seed_never_touches_an_existing_catalogue(db):
    mig = _migration()
    db.add(BillingPlan(name="T-Admin-made plan", status="active", version=1))
    await db.flush()
    count = len((await db.execute(select(BillingPlan))).scalars().all())
    assert await db.run_sync(lambda s: mig.seed_plans(s.connection())) == 0  # the catalogue isn't empty, so it does nothing
    assert len((await db.execute(select(BillingPlan))).scalars().all()) == count
