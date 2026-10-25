import uuid

import pytest
from sqlalchemy import func, select

from app.core.exceptions import ValidationError
from app.modules.billing import enrollment
from app.modules.billing.models import (
    BillingInvoice,
    BillingPlan,
    BillingPrice,
    BillingSubscription,
)
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.models.feature import FeatureFlag

pytestmark = pytest.mark.db


def _terms(currency, monthly, *, users=(1, 1), branches=(1, 1), modules=()):
    return {"currency": currency, "monthly": monthly, "annual": monthly * 10, "seat_monthly": 0, "branch_monthly": 0, "included_users": users[0], "included_branches": branches[0],
            "max_users": users[1], "max_branches": branches[1], "max_products": None, "max_storage_mb": None, "modules": list(modules), "trial_days": 0, "tax_bps": 0,
            "bill_active_users": False}


async def _setup(db):
    """Two isolated plans (the real catalogue is excluded by naming one plan id), a superadmin and three businesses."""
    n = uuid.uuid4().hex[:6]
    real = {k: False for (k,) in (await db.execute(select(FeatureFlag.key))).all()}  # the platform's real modules are switched off for these test businesses
    db.add_all([FeatureFlag(key=f"e_sales_{n}", name="Sales", module="sales", default_enabled=False), FeatureFlag(key=f"e_hr_{n}", name="HR", module="hr", default_enabled=False)])
    small = BillingPlan(name=f"E-Small {n}", status="active", version=1)
    big = BillingPlan(name=f"E-Big {n}", status="active", version=1)
    admin = User(email=f"a{n}@pesaa.test", hashed_password="x", full_name="Admin", role="superadmin", tenant_id=None, is_superuser=True, is_active=True)
    db.add_all([small, big, admin])
    await db.flush()
    db.add_all([BillingPrice(plan_id=small.id, version=1, currency="RWF", terms=_terms("RWF", 10000, users=(2, 2), modules=[f"e_sales_{n}"])),
                BillingPrice(plan_id=big.id, version=1, currency="RWF", terms=_terms("RWF", 50000, users=(2, 20), modules=[f"e_sales_{n}", f"e_hr_{n}"]))])
    tenants = []
    for label, users, features in (("simple", 1, {f"e_sales_{n}": True}), ("needs-hr", 1, {f"e_sales_{n}": True, f"e_hr_{n}": True}), ("big-team", 6, {f"e_sales_{n}": True})):
        t = Tenant(name=f"{label}-{n}", slug=f"{label}-{n}", is_active=True, currency="RWF", features={**real, **features})
        db.add(t)
        await db.flush()
        for i in range(users):
            db.add(User(email=f"{label}{i}-{n}@x.test", hashed_password="x", full_name="U", role="owner" if i == 0 else "member", tenant_id=t.id, is_active=True))
        tenants.append(t)
    await db.flush()
    return admin, small, big, tenants


async def test_picks_the_cheapest_plan_that_fits_users_and_modules_and_never_charges(db):
    admin, small, big, (simple, needs_hr, big_team) = await _setup(db)
    ids = [simple.id, needs_hr.id, big_team.id]
    preview = await enrollment.enroll_existing(db, admin, mode="complimentary", plan_id=None, tenant_ids=ids)
    assert preview["dryRun"] and preview["candidates"] == 3 and preview["toEnroll"] == 3 and preview["skippedCount"] == 0
    # nothing is written by a preview
    assert (await db.execute(select(func.count()).select_from(BillingSubscription).where(BillingSubscription.tenant_id.in_(ids)))).scalar_one() == 0

    with pytest.raises(ValidationError):  # a real run needs the exact count from the preview
        await enrollment.enroll_existing(db, admin, mode="complimentary", dry_run=False, confirm_count=2, tenant_ids=ids)
    done = await enrollment.enroll_existing(db, admin, mode="complimentary", dry_run=False, confirm_count=3, tenant_ids=ids)
    assert done["enrolled"] == 3 and done["failed"] == []

    subs = {s.tenant_id: s for s in (await db.execute(select(BillingSubscription).where(BillingSubscription.tenant_id.in_(ids)))).scalars().all()}
    assert subs[simple.id].plan_id == small.id  # cheapest plan that fits
    assert subs[needs_hr.id].plan_id == big.id  # the small plan lacks HR, which this business uses — never take a feature away
    assert subs[big_team.id].plan_id == big.id  # six users exceed the small plan's limit of two
    for s in subs.values():
        assert s.status == "active" and s.discount_bps == 10000 and s.recurring == 0 and s.trial_end is None
    assert (await db.execute(select(func.count()).select_from(BillingInvoice).where(BillingInvoice.tenant_id.in_(ids)))).scalar_one() == 0  # no invoices
    await db.refresh(simple)
    assert simple.subscription_plan == str(small.id) and simple.subscription_status == "active"

    again = await enrollment.enroll_existing(db, admin, mode="complimentary", tenant_ids=ids)
    assert again["candidates"] == 0 and again["toEnroll"] == 0  # already subscribed: re-running does nothing


async def test_trial_mode_starts_a_free_trial_without_an_invoice(db):
    admin, small, _big, (simple, *_rest) = await _setup(db)
    done = await enrollment.enroll_existing(db, admin, mode="trial", trial_days=14, dry_run=False, confirm_count=1, tenant_ids=[simple.id])
    assert done["enrolled"] == 1
    sub = (await db.execute(select(BillingSubscription).where(BillingSubscription.tenant_id == simple.id))).scalar_one()
    assert sub.status == "trialing" and sub.discount_bps == 0 and sub.plan_id == small.id and (sub.period_end - sub.period_start).days in (13, 14)
    assert sub.recurring == 10000 and sub.trial_end == sub.period_end  # it will be invoiced when the trial ends
    assert (await db.execute(select(func.count()).select_from(BillingInvoice).where(BillingInvoice.tenant_id == simple.id))).scalar_one() == 0


async def test_businesses_that_fit_nothing_are_skipped_and_listed(db):
    admin, small, _big, (_a, _b, big_team) = await _setup(db)
    result = await enrollment.enroll_existing(db, admin, mode="complimentary", plan_id=small.id, tenant_ids=[big_team.id])  # forced onto a plan it cannot fit
    assert result["toEnroll"] == 0 and result["skippedCount"] == 1 and "No plan covers" in result["skipped"][0]["reason"]


async def test_only_platform_admins_can_enrol(db):
    _admin, *_ = await _setup(db)
    from app.core.exceptions import ForbiddenError

    tenant_user = User(email=f"t{uuid.uuid4().hex[:6]}@x.test", hashed_password="x", full_name="T", role="owner", tenant_id=None, is_superuser=False, is_active=True)
    with pytest.raises(ForbiddenError):
        await enrollment.enroll_existing(db, tenant_user, mode="complimentary")


async def test_keep_modules_off_chooses_by_usage_only(db):
    admin, small, _big, (_simple, needs_hr, _team) = await _setup(db)
    kept = await enrollment.enroll_existing(db, admin, mode="complimentary", tenant_ids=[needs_hr.id])
    assert kept["byPlan"][0]["plan"].startswith("E-Big")  # keeps its HR module by taking the bigger plan
    loose = await enrollment.enroll_existing(db, admin, mode="complimentary", tenant_ids=[needs_hr.id], keep_modules=False)
    assert loose["byPlan"][0]["plan"] == small.name and loose["keepModules"] is False  # cheapest plan by users/branches, even though it lacks HR
