"""Public pricing: the plans and prices the marketing website shows, read straight from the billing tables so the site can
never drift from what a business is actually charged. Only ACTIVE plans at their CURRENT version are exposed, and only
what a visitor needs — no internal ids of subscriptions, no tax registration or operational settings. Amounts are in
currency minor units, exactly as stored (the website formats them with the currency's own exponent)."""
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_cache, ttl_cache
from app.core.database import AsyncSessionLocal
from app.core.rate_limit import rate_limit
from app.core.response import success_response
from app.modules.billing.models import BillingPlan, BillingPrice
from app.modules.tenants.models.feature import FeatureFlag

NAMESPACE = "public-pricing"
router = APIRouter(prefix="/public", tags=["Public pricing"])


def invalidate_public_pricing() -> None:
    invalidate_cache(NAMESPACE)


def _price(terms: dict[str, Any]) -> dict[str, Any]:
    return {
        "monthly": terms.get("monthly", 0), "annual": terms.get("annual", 0),
        "seatMonthly": terms.get("seat_monthly", 0), "branchMonthly": terms.get("branch_monthly", 0),
        "includedUsers": terms.get("included_users", 1), "maxUsers": terms.get("max_users"),
        "includedBranches": terms.get("included_branches", 1), "maxBranches": terms.get("max_branches"),
        "maxProducts": terms.get("max_products"), "maxStorageMb": terms.get("max_storage_mb"),
        "trialDays": terms.get("trial_days", 0), "taxBps": terms.get("tax_bps", 0),
        "billActiveUsers": bool(terms.get("bill_active_users", False)),
    }


async def build_pricing(db: AsyncSession) -> dict[str, Any]:
    plans = (await db.execute(select(BillingPlan).where(BillingPlan.status == "active").order_by(BillingPlan.created_at))).scalars().all()
    rows = (await db.execute(select(BillingPrice).where(BillingPrice.plan_id.in_([p.id for p in plans])))).scalars().all() if plans else []
    current = {(r.plan_id, r.currency): r for r in rows if r.version == next(p.version for p in plans if p.id == r.plan_id)}
    keys = {k for r in current.values() for k in (r.terms.get("modules") or [])}
    names = {f.key: f.name for f in (await db.execute(select(FeatureFlag).where(FeatureFlag.key.in_(keys)))).scalars().all()} if keys else {}
    out, currencies = [], set()
    for p in plans:
        priced = {c: r for (pid, c), r in current.items() if pid == p.id}
        if not priced:
            continue
        currencies |= set(priced)
        modules = sorted({k for r in priced.values() for k in (r.terms.get("modules") or [])})
        out.append({
            "id": str(p.id), "name": p.name, "description": p.description,
            "prices": {c: _price(r.terms) for c, r in sorted(priced.items())},
            "modules": [{"key": k, "name": names.get(k, k.replace("_", " ").title())} for k in modules],
        })
    # Cheapest first, using each plan's lowest monthly price so mixed-currency catalogs still order sensibly.
    out.sort(key=lambda x: (min(v["monthly"] for v in x["prices"].values()), x["name"].lower()))
    return {"plans": out, "currencies": sorted(currencies), "generatedAt": datetime.now(UTC).isoformat()}


@ttl_cache(NAMESPACE, 120.0)
async def _cached() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        return await build_pricing(db)


@router.get("/pricing", dependencies=[Depends(rate_limit("public-pricing", 120, 60))])
async def public_pricing(response: Response):
    """Active plans with their current prices and entitlements. Public, cached for a couple of minutes."""
    response.headers["Cache-Control"] = "public, max-age=60"
    return success_response(data=await _cached(), message="Pricing retrieved")
