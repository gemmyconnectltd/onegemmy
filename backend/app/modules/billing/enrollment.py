"""Move businesses that have no subscription onto a plan — safely.

Existing ("legacy") businesses keep full access until they are migrated. Migrating them through the normal plan-change flow
would invoice each one immediately and, if unpaid, lock them out after the grace period. This tool instead grants the plan
WITHOUT charging now:

- `trial`: a free trial of N days; when it ends the billing worker issues the first invoice as for any trial.
- `complimentary`: a 100%-discounted subscription — on the plan, no invoices, until an admin ends the discount.

For each business it picks the cheapest active plan that (a) is priced in the business's own currency (else USD, else the
first available), (b) allows its current users and branches, and (c) by default includes every module the business uses today — a plan
only ever *restricts* modules, so enrolling must not take a feature away unless `keep_modules` is turned off. Businesses that fit nothing are skipped and
listed. It is a dry run unless explicitly confirmed with the exact number of businesses it would enroll."""
import uuid
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ValidationError
from app.modules.audit.service import record_audit
from app.modules.billing import service
from app.modules.billing.models import BillingPlan, BillingPrice, BillingSubscription
from app.modules.billing.repository import BillingRepository
from app.modules.tenants.models import Tenant
from app.modules.tenants.models.feature import FeatureFlag

Mode = Literal["trial", "complimentary"]
MAX_LISTED = 100


async def _plans(db: AsyncSession, only: uuid.UUID | None) -> list[tuple[BillingPlan, dict[str, BillingPrice]]]:
    stmt = select(BillingPlan).where(BillingPlan.status == "active")
    if only:
        stmt = stmt.where(BillingPlan.id == only)
    plans = (await db.execute(stmt)).scalars().all()
    out = []
    for p in plans:
        prices = (await db.execute(select(BillingPrice).where(BillingPrice.plan_id == p.id, BillingPrice.version == p.version))).scalars().all()
        if prices:
            out.append((p, {r.currency: r for r in prices}))
    return out


def _fits(terms: dict[str, Any], usage: dict[str, int], modules: set[str]) -> bool:
    return ((terms.get("max_users") is None or usage["users"] <= terms["max_users"])
            and (terms.get("max_branches") is None or usage["branches"] <= terms["max_branches"])
            and modules <= set(terms.get("modules") or []))


def choose(plans: list[tuple[BillingPlan, dict[str, BillingPrice]]], tenant_currency: str, usage: dict[str, int], modules: set[str]) -> tuple[BillingPlan, BillingPrice] | None:
    available = {c for _, prices in plans for c in prices}
    currency = tenant_currency if tenant_currency in available else ("USD" if "USD" in available else (min(available) if available else None))
    if currency is None:
        return None
    fitting = [(p, prices[currency]) for p, prices in plans if currency in prices and _fits(prices[currency].terms, usage, modules)]
    return min(fitting, key=lambda x: (x[1].terms["monthly"], x[0].name), default=None)


async def enroll_existing(
    db: AsyncSession, actor: Any, *, mode: Mode, trial_days: int = 30, plan_id: uuid.UUID | None = None, notify: bool = False,
    dry_run: bool = True, confirm_count: int | None = None, tenant_ids: list[uuid.UUID] | None = None, keep_modules: bool = True,
) -> dict[str, Any]:
    service.authorize(actor, "update", platform=True)
    if mode == "trial" and not 1 <= trial_days <= 365:
        raise ValidationError("A trial must be between 1 and 365 days")
    repo = BillingRepository(db)
    plans = await _plans(db, plan_id)
    if not plans:
        raise ValidationError("There is no active plan with a price to enrol businesses on")
    flags = (await db.execute(select(FeatureFlag).where(FeatureFlag.is_active.is_(True)))).scalars().all()
    stmt = (select(Tenant).outerjoin(BillingSubscription, BillingSubscription.tenant_id == Tenant.id)
            .where(BillingSubscription.id.is_(None), Tenant.archived_at.is_(None), Tenant.is_active.is_(True)).order_by(Tenant.created_at))
    if tenant_ids:  # a pilot: only these businesses
        stmt = stmt.where(Tenant.id.in_(tenant_ids))
    tenants = (await db.execute(stmt)).scalars().all()

    assignments: list[tuple[Tenant, BillingPlan, BillingPrice]] = []
    skipped: list[dict[str, str]] = []
    for t in tenants:
        usage = await repo.usage(t.id)
        overrides = t.features or {}
        modules = {f.key for f in flags if overrides.get(f.key, f.default_enabled)}
        pick = choose(plans, t.currency, usage, modules if keep_modules else set())
        if pick is None:
            skipped.append({"id": str(t.id), "name": t.name, "reason": "No plan covers its current users, branches and modules"})
        else:
            assignments.append((t, *pick))

    by_plan: dict[str, dict[str, Any]] = {}
    for _, p, price in assignments:
        row = by_plan.setdefault(p.name, {"plan": p.name, "businesses": 0, "currencies": {}})
        row["businesses"] += 1
        row["currencies"][price.currency] = row["currencies"].get(price.currency, 0) + 1
    result: dict[str, Any] = {
        "dryRun": dry_run, "mode": mode, "keepModules": keep_modules, "trialDays": trial_days if mode == "trial" else 0, "candidates": len(tenants), "toEnroll": len(assignments),
        "byPlan": sorted(by_plan.values(), key=lambda r: r["plan"]), "skipped": skipped[:MAX_LISTED], "skippedCount": len(skipped),
        "sample": [{"id": str(t.id), "name": t.name, "plan": p.name, "currency": price.currency} for t, p, price in assignments[:MAX_LISTED]],
    }
    if dry_run:
        return result
    if confirm_count != len(assignments):
        raise ValidationError(f"Confirm the number of businesses to enrol ({len(assignments)}); it may have changed since the preview")
    enrolled, failed = 0, []
    for t, p, price in assignments:
        try:
            async with db.begin_nested():
                await service.grant_subscription(
                    db, actor, t.id, p, price, "monthly", trial_days=trial_days if mode == "trial" else 0,
                    discount_bps=10000 if mode == "complimentary" else 0, notify=notify,
                    reason=f"Bulk enrolment of an existing business ({mode})")
            enrolled += 1
        except AppError as e:
            failed.append({"id": str(t.id), "name": t.name, "reason": str(getattr(e, "detail", e))[:200]})
    await record_audit(db, tenant_id=None, actor_user_id=actor.id, actor_name=actor.full_name or actor.email, action="billing.bulk_enrol",
                       entity_type="billing_subscriptions", entity_id=str(uuid.uuid4()), summary=f"Enrolled {enrolled} existing businesses on plans ({mode})",
                       changes={"mode": mode, "trial_days": trial_days, "enrolled": enrolled, "failed": len(failed), "skipped": len(skipped), "notify": notify})
    return {**result, "dryRun": False, "enrolled": enrolled, "failed": failed}
