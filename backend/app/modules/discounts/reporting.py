"""Discount reporting reads persisted sales; pending and voided sales are excluded."""

from datetime import UTC, datetime

from sqlalchemy import func, select

from app.modules.approvals.models import ApprovalRequest
from app.modules.audit.models.audit import AuditLog
from app.modules.discounts.models import AppliedDiscount, DiscountRule, PromotionCampaign
from app.modules.sales.models.order import Order


async def analytics(db, tenant_id, branch_id, start=None, end=None):
    filters = [
        AppliedDiscount.tenant_id == tenant_id,
        Order.tenant_id == tenant_id,
        Order.status == "Completed",
    ]
    if branch_id:
        filters.append(AppliedDiscount.branch_id == branch_id)
    if start:
        filters.append(AppliedDiscount.created_at >= start)
    if end:
        filters.append(AppliedDiscount.created_at < end)
    rows = (
        (
            await db.execute(
                select(
                    AppliedDiscount.rule_name,
                    AppliedDiscount.kind,
                    func.sum(AppliedDiscount.amount).label("amount"),
                    func.count(func.distinct(AppliedDiscount.order_id)).label("sales"),
                )
                .join(Order, Order.id == AppliedDiscount.order_id)
                .where(*filters)
                .group_by(AppliedDiscount.rule_name, AppliedDiscount.kind)
                .order_by(func.sum(AppliedDiscount.amount).desc())
                .limit(100)
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


async def overview(db, tenant_id, branch_id):
    now = datetime.now(UTC)
    active = await db.scalar(
        select(func.count())
        .select_from(DiscountRule)
        .where(
            DiscountRule.tenant_id == tenant_id,
            DiscountRule.status == "Active",
            (DiscountRule.starts_at.is_(None) | (DiscountRule.starts_at <= now)),
            (DiscountRule.ends_at.is_(None) | (DiscountRule.ends_at > now)),
        )
    )
    upcoming = await db.scalar(
        select(func.count())
        .select_from(PromotionCampaign)
        .where(
            PromotionCampaign.tenant_id == tenant_id,
            PromotionCampaign.status.in_(["Scheduled", "Active"]),
            PromotionCampaign.starts_at > now,
        )
    )
    filters = [
        AppliedDiscount.tenant_id == tenant_id,
        Order.tenant_id == tenant_id,
        Order.status == "Completed",
    ]
    approval_filters = [
        ApprovalRequest.tenant_id == tenant_id,
        ApprovalRequest.kind == "discount",
        ApprovalRequest.status == "pending",
    ]
    if branch_id:
        filters.append(AppliedDiscount.branch_id == branch_id)
        approval_filters.append(ApprovalRequest.branch_id == branch_id)
    total, sales, coupons = (
        await db.execute(
            select(
                func.coalesce(func.sum(AppliedDiscount.amount), 0),
                func.count(func.distinct(AppliedDiscount.order_id)),
                func.count().filter(AppliedDiscount.kind == "coupon"),
            )
            .join(Order, Order.id == AppliedDiscount.order_id)
            .where(*filters)
        )
    ).one()
    pending = await db.scalar(
        select(func.count()).select_from(ApprovalRequest).where(*approval_filters)
    )
    activity = (
        (
            await db.execute(
                select(AuditLog.action, AuditLog.summary, AuditLog.created_at)
                .where(AuditLog.tenant_id == tenant_id, AuditLog.action.like("discount.%"))
                .order_by(AuditLog.created_at.desc())
                .limit(10)
            )
        )
        .mappings()
        .all()
    )
    return {
        "active_rules": active,
        "scheduled_campaigns": upcoming,
        "total_discounts": str(total),
        "discounted_sales": sales,
        "coupon_redemptions": coupons,
        "pending_approvals": pending,
        "activity": [dict(row) for row in activity],
    }
