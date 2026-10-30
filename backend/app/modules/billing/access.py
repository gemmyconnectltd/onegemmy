import uuid
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ForbiddenError
from app.modules.billing.repository import BillingRepository
from app.modules.billing.service import now_utc


async def enforce_write(db: AsyncSession, tenant_id: uuid.UUID, path: str, method: str) -> None:
    if not settings.ENFORCE_SUBSCRIPTION_WRITE_BLOCK:
        return  # subscription state doesn't block changes at the moment (see the setting)
    if method in {"GET", "HEAD", "OPTIONS"} or path.startswith(
        ("/api/v1/auth/", "/api/v1/tenants/billing/", "/api/v1/support/")
    ):
        return
    sub = await BillingRepository(db).subscription(tenant_id)
    if sub is None:
        repo = BillingRepository(db)
        tenant = await repo.tenant(tenant_id)
        if tenant.billing_required:
            from app.modules.billing.schemas import BillingSettingsInput

            policy = BillingSettingsInput.model_validate((await repo.settings()).data)
            if policy.require_new_businesses:
                raise ForbiddenError(
                    "Choose a plan in Settings → Plans & Billing before making business changes"
                )
        return  # Legacy businesses retain existing access until explicitly migrated.
    if sub.status in {"active", "past_due"}:
        invoice = await BillingRepository(db).first_unpaid(tenant_id)
        if invoice is not None and invoice.source_key.startswith("change:"):
            raise ForbiddenError("Pay your plan invoice to activate this subscription")
        if invoice is not None:
            from app.modules.billing.schemas import BillingSettingsInput

            config = BillingSettingsInput.model_validate(
                (await BillingRepository(db).settings()).data
            )
            if invoice.due_at + timedelta(days=config.grace_days) < now_utc():
                raise ForbiddenError("Billing grace period ended. Renew in Plans & Billing")
    if sub.status in {"canceled", "expired", "suspended"}:
        raise ForbiddenError("Subscription is read-only. Renew in Settings → Plans & Billing")
    if sub.status in {"trialing", "active"} and sub.period_end < now_utc():
        # Do not rely solely on a worker to enforce expiry. A bounded grace protects job outages.
        from app.modules.billing.schemas import BillingSettingsInput

        config = BillingSettingsInput.model_validate((await BillingRepository(db).settings()).data)
        if sub.period_end + timedelta(days=config.due_days + config.grace_days) < now_utc():
            raise ForbiddenError("Subscription has expired. Renew in Settings → Plans & Billing")
