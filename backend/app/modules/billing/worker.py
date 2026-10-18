"""Durable database work queues. Run `python -m app.modules.billing.worker` under a supervisor."""

import asyncio
import html
import uuid
from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.email import _branded_html, send_email_message
from app.core.logging import get_logger
from app.modules.billing import provider, refunds
from app.modules.billing.models import BillingReport
from app.modules.billing.money import cost, next_period, proration
from app.modules.billing.payments import reconcile
from app.modules.billing.repository import (
    BillingRepository,
    rebuild_daily,
    report_totals,
    subscription_batch,
)
from app.modules.billing.schemas import BillingSettingsInput
from app.modules.billing.service import audit, issue_invoice, notice, now_utc, sync_tenant

log = get_logger("billing.worker")


async def process_subscription(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    repo = BillingRepository(db)
    await repo.tenant(tenant_id, lock=True)
    sub = await repo.subscription(tenant_id)
    if sub is None:
        return
    now = now_utc()
    config = BillingSettingsInput.model_validate((await repo.settings()).data)
    overdue = await repo.mark_overdue(tenant_id, now)
    if overdue:
        await audit(db, None, tenant_id, "invoices_overdue", sub, {"invoices": overdue})
    if sub.status in {"canceled", "expired", "suspended"}:
        await db.commit()
        return
    unpaid = await repo.first_unpaid(tenant_id)
    if unpaid and unpaid.due_at < now:
        status = (
            "suspended" if unpaid.due_at + timedelta(days=config.grace_days) < now else "past_due"
        )
        if status != sub.status:
            sub.status = status
            sub.revision += 1
            await sync_tenant(repo, sub)
            await audit(db, None, tenant_id, "lifecycle", sub, {"status": status})
        if status == "suspended":
            await db.commit()
            return
    if sub.period_end - timedelta(days=config.reminder_days) <= now < sub.period_end:
        await notice(
            db,
            tenant_id,
            f"reminder:{sub.id}:{sub.period_end.isoformat()}",
            "Your Pesaa subscription renews soon",
            "Your trial or billing period ends soon. Review renewal details in Plans & Billing.",
        )
    if sub.period_end <= now:
        before_state = (
            sub.status,
            sub.period_start,
            sub.period_end,
            sub.recurring,
            sub.discount_bps,
        )
        if sub.cancel_at_end:
            sub.status = "canceled"
        else:
            end = next_period(sub.period_end, sub.cycle, sub.billing_anchor_day)
            if sub.next_discount_bps is not None:
                sub.discount_bps, sub.next_discount_bps = sub.next_discount_bps, None
            amounts = cost(sub.terms, sub.cycle, sub.seats, sub.branches, sub.discount_bps)
            sub.recurring, sub.recurring_net = amounts["total"], amounts["subtotal"]
            invoice = await issue_invoice(
                db,
                sub,
                amounts["total"],
                f"renewal:{sub.id}:{sub.period_end.isoformat()}",
                "Subscription renewal",
                sub.period_end,
                end,
                amounts["tax"],
            )
            if invoice is None or invoice.status == "paid":
                sub.period_start, sub.period_end, sub.status = sub.period_end, end, "active"
            else:
                sub.status = (
                    "suspended"
                    if now > invoice.due_at + timedelta(days=config.grace_days)
                    else "past_due"
                )
                if invoice.due_at < now and invoice.status == "open":
                    invoice.status = "overdue" if invoice.paid == 0 else "partially_paid"
                    await audit(
                        db, None, tenant_id, "invoice_overdue", invoice, {"status": invoice.status}
                    )
        after_state = (
            sub.status,
            sub.period_start,
            sub.period_end,
            sub.recurring,
            sub.discount_bps,
        )
        if before_state != after_state:
            sub.revision += 1
            await sync_tenant(repo, sub)
            await audit(db, None, tenant_id, "lifecycle", sub, {"status": sub.status})
            await notice(
                db,
                tenant_id,
                f"lifecycle:{sub.id}:{sub.revision}",
                "Your Pesaa subscription status changed",
                f"Subscription status: {sub.status}. Review your account in Plans & Billing.",
            )
    elif sub.status in {"active", "trialing", "past_due"}:
        await sync_usage(db, tenant_id)
    await db.commit()


async def sync_usage(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """Called within user/branch mutations, using the same tenant lock and transaction."""
    repo = BillingRepository(db)
    await repo.tenant(tenant_id, lock=True)
    sub = await repo.subscription(tenant_id)
    if sub is None:
        return
    now = now_utc()
    if sub.status in {"active", "trialing", "past_due"}:
        period_start, period_end = sub.period_start, sub.period_end
        if period_end <= now:
            unpaid = await repo.first_unpaid(tenant_id)
            if unpaid and unpaid.source_key.startswith("renewal:") and unpaid.period_end > now:
                period_start, period_end = unpaid.period_start, unpaid.period_end
            else:
                return
        usage = await repo.usage(tenant_id)
        if usage["users"] != sub.seats or usage["branches"] != sub.branches:
            amounts = cost(
                sub.terms, sub.cycle, usage["users"], usage["branches"], sub.discount_bps
            )
            old_tax = cost(sub.terms, sub.cycle, sub.seats, sub.branches, sub.discount_bps)["tax"]
            adjustment = proration(sub.recurring, amounts["total"], period_start, period_end, now)
            adjustment_tax = proration(old_tax, amounts["tax"], period_start, period_end, now)
            if sub.status != "trialing":
                if adjustment > 0:
                    await issue_invoice(
                        db,
                        sub,
                        adjustment,
                        f"seats:{sub.id}:{sub.revision}",
                        "Prorated user and branch adjustment",
                        now,
                        period_end,
                        max(0, adjustment_tax),
                    )
                elif adjustment < 0:
                    sub.credit += -adjustment
            sub.seats, sub.branches, sub.recurring = (
                usage["users"],
                usage["branches"],
                amounts["total"],
            )
            sub.recurring_net = amounts["subtotal"]
            sub.revision += 1
            await audit(
                db,
                None,
                tenant_id,
                "usage_adjusted",
                sub,
                {"seats": sub.seats, "branches": sub.branches, "adjustment": adjustment},
            )


async def deliver_notices(db: AsyncSession) -> None:
    repo = BillingRepository(db)
    notices = await repo.notices(now_utc())
    recipients = await repo.owner_emails({row.tenant_id for row in notices})
    for row in notices:
        email = recipients.get(row.tenant_id)
        row.attempts += 1
        if email:
            result = await send_email_message(
                email,
                row.subject,
                _branded_html(row.subject, f"<p>{html.escape(row.body)}</p>"),
                sender="accounts",
            )
            if result:
                row.sent_at = now_utc()
        row.available_at = now_utc() + timedelta(minutes=min(1440, 2**row.attempts))
    await db.commit()


async def refresh_reports(db: AsyncSession) -> None:
    repo = BillingRepository(db)
    await repo.lock("billing-report")
    await rebuild_daily(db)
    data = {"subscriptions": await report_totals(db)}
    row = await repo.report("overview")
    if row is None:
        row = BillingReport(key="overview", data=data, updated_at=now_utc())
        db.add(row)
    else:
        row.data, row.updated_at = data, now_utc()
    await db.commit()


async def run_once(cursor: uuid.UUID | None = None) -> uuid.UUID | None:
    async with AsyncSessionLocal() as db:
        batch = await subscription_batch(db, cursor)
        ids = [(r.id, r.tenant_id) for r in batch]
    for _, tenant_id in ids:
        async with AsyncSessionLocal() as db:
            try:
                await process_subscription(db, tenant_id)
            except Exception:  # noqa: BLE001 - keep other tenants and durable jobs running
                await db.rollback()
                log.error(
                    "billing.lifecycle_failed",
                    extra={"_extra_fields": {"tenant_id": str(tenant_id)}},
                )
    if provider.enabled():
        from app.modules.billing.repository import pending_refunds

        async with AsyncSessionLocal() as db:
            refund_refs = [r.reference for r in await pending_refunds(db)]
        for reference in refund_refs:
            async with AsyncSessionLocal() as db:
                try:
                    await refunds.reconcile(db, reference)
                except Exception:  # noqa: BLE001 - retry durable job on the next cycle
                    await db.rollback()
                    log.error("billing.refund_reconciliation_failed")
        async with AsyncSessionLocal() as db:
            refs = [r.reference for r in await BillingRepository(db).pending_payments()]
        for ref in refs:
            async with AsyncSessionLocal() as db:
                try:
                    await reconcile(db, ref)
                except Exception:  # noqa: BLE001 - keep other tenants and durable jobs running
                    await db.rollback()
                    log.error("billing.reconciliation_failed")
    async with AsyncSessionLocal() as db:
        await deliver_notices(db)
    if len(ids) < 100:
        async with AsyncSessionLocal() as db:
            await refresh_reports(db)
        return None
    return ids[-1][0]


async def main() -> None:
    cursor = None
    while True:
        try:
            cursor = await run_once(cursor)
        except Exception:  # noqa: BLE001 - keep other tenants and durable jobs running
            log.error("billing.worker_cycle_failed")
        await asyncio.sleep(30)


if __name__ == "__main__":
    asyncio.run(main())
