from sqlalchemy import String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models import BillingPlan
from app.modules.tenants.models import Tenant


async def tenant_plan_labels(db: AsyncSession) -> dict[str, str]:
    """Label only plans actually used by tenants, including legacy tier keys."""
    rows = (await db.execute(
        select(Tenant.subscription_plan, func.coalesce(BillingPlan.name, Tenant.subscription_plan))
        .outerjoin(BillingPlan, cast(BillingPlan.id, String) == Tenant.subscription_plan)
        .group_by(Tenant.subscription_plan, BillingPlan.name)
    )).all()
    return dict(rows)
