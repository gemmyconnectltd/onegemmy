"""Discount rules, promotion campaigns, coupons and the record of what was actually given on each sale.

Rules and campaigns can be changed or switched off at any time; what a sale got is frozen in `discount_applied` (with a snapshot of the rule as it was),
so history never moves when a rule does.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

RULE_STATUSES = ("Draft", "Active", "Paused", "Cancelled", "Archived")
CAMPAIGN_STATUSES = ("Draft", "Scheduled", "Active", "Paused", "Expired", "Cancelled", "Archived")


class PromotionCampaign(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A named promotion that groups several rules (for example "Black Friday 2026")."""

    __tablename__ = "discount_campaigns"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="Draft")
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    branch_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    target: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )  # {"customer_ids": [...], "customer_types": [...]}
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    __table_args__ = (
        Index("uq_discount_campaigns_code", "tenant_id", func.lower(code), unique=True),
    )


class DiscountRule(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "discount_rules"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="Draft")
    value_kind: Mapped[str] = mapped_column(String(8), nullable=False, default="percent")
    value: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    max_discount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    config: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )  # scope, conditions, tiers, buy/get, time window
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    combinable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    exclusive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_combined_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discount_campaigns.id", ondelete="SET NULL")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("uq_discount_rules_code", "tenant_id", func.lower(code), unique=True),
        Index("ix_discount_rules_status", "tenant_id", "status"),
    )


class Coupon(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A code that unlocks a coupon-type rule. Redemptions are counted on this row with one atomic update, so two tills cannot both take the last one."""

    __tablename__ = "discount_coupons"

    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discount_rules.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="Active"
    )  # Active | Disabled
    max_redemptions: Mapped[int | None] = mapped_column(Integer)
    per_customer_limit: Mapped[int | None] = mapped_column(Integer)
    redeemed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    __table_args__ = (
        Index("uq_discount_coupons_code", "tenant_id", func.upper(code), unique=True),
    )


class CouponRedemption(UUIDPKMixin, TenantScopedMixin, Base):
    __tablename__ = "discount_coupon_redemptions"

    coupon_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discount_coupons.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    released: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )  # true once the sale was voided and the use given back
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("uq_discount_redemptions_order", "coupon_id", "order_id", unique=True),
        Index("ix_discount_redemptions_customer", "tenant_id", "coupon_id", "customer_id"),
    )


class AppliedDiscount(UUIDPKMixin, TenantScopedMixin, Base):
    """What one rule (or a manual discount) took off one sale, frozen as it was."""

    __tablename__ = "discount_applied"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discount_rules.id", ondelete="SET NULL")
    )
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discount_campaigns.id", ondelete="SET NULL")
    )
    rule_name: Mapped[str] = mapped_column(String(150), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(12), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # automatic | coupon | manual
    coupon_code: Mapped[str | None] = mapped_column(String(40))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    lines: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[str | None] = mapped_column(String(500))
    approval_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL")
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_discount_applied_order", "order_id"),
        Index("ix_discount_applied_rule", "tenant_id", "rule_id"),
        Index("ix_discount_applied_created", "tenant_id", "created_at"),
        Index("ix_discount_applied_campaign", "tenant_id", "campaign_id"),
        Index("ix_discount_applied_branch", "tenant_id", "branch_id", "created_at"),
    )
