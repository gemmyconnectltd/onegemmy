import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class FeatureFlag(UUIDPKMixin, TimestampMixin, Base):
    """Platform feature catalog. Per-tenant overrides live on ``Tenant.features``."""

    __tablename__ = "feature_flags"

    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    module: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    default_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ModuleFeature(UUIDPKMixin, TimestampMixin, Base):
    """A submodule or feature inside a module (``feature_flags`` row). Kept apart from ``feature_flags`` on purpose:
    plans, billing and the business's own module switches only ever see modules. Which routes each entry covers is
    code (``feature_tree.TREE``); this row holds what Pesaa can edit: name, description and the platform switch."""

    __tablename__ = "module_features"

    key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    module_key: Mapped[str] = mapped_column(
        String(100), ForeignKey("feature_flags.key", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)  # a submodule's key, or None
    level: Mapped[str] = mapped_column(String(20), nullable=False)  # "submodule" | "feature"
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class TenantFeatureRestriction(UUIDPKMixin, TimestampMixin, Base):
    """Pesaa has switched one submodule or feature off for one business. One row per (business, key); removing the row
    restores it. The business's records are never touched."""

    __tablename__ = "tenant_feature_restrictions"
    __table_args__ = (UniqueConstraint("tenant_id", "feature_key", name="uq_tenant_feature_restriction"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    feature_key: Mapped[str] = mapped_column(
        String(120), ForeignKey("module_features.key", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class FeatureControl(UUIDPKMixin, TimestampMixin, Base):
    """Pesaa's full control over one module or part (key of a ``feature_flags`` or ``module_features`` row): its status
    and the message businesses see, a scheduled status change, rollout, kill switch and which actions are allowed.
    No row means the defaults: active, everyone, nothing extra switched off. Rules live in ``service.feature_control``."""

    __tablename__ = "feature_controls"

    key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    message: Mapped[str | None] = mapped_column(String(500))
    scheduled_status: Mapped[str | None] = mapped_column(String(20))
    scheduled_message: Mapped[str | None] = mapped_column(String(500))
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rollout_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    kill_switch: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    kill_reason: Mapped[str | None] = mapped_column(String(255))
    # action -> "everyone" (default, role permissions decide) | "admins" (owners and administrators only) | "off"
    actions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Settings and limits (see feature_control.SETTINGS), plus "plans" (plan ids that include a part) and
    # "plan_daily_limits" ({plan_id: n}).
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class FeatureCohortMember(UUIDPKMixin, TimestampMixin, Base):
    """A business, branch or user that gets a Beta feature, or gets it ahead of a percentage rollout."""

    __tablename__ = "feature_cohort"
    __table_args__ = (UniqueConstraint("feature_key", "target_type", "target_id", name="uq_feature_cohort_target"),)

    feature_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(10), nullable=False)  # tenant | branch | user
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class FeatureTenantOverride(UUIDPKMixin, TimestampMixin, Base):
    """An exception for one business: its own status and message, action rules or settings for one module or part.
    Empty fields inherit the platform control."""

    __tablename__ = "feature_tenant_overrides"
    __table_args__ = (UniqueConstraint("feature_key", "tenant_id", name="uq_feature_tenant_override"),)

    feature_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str | None] = mapped_column(String(20))
    message: Mapped[str | None] = mapped_column(String(500))
    actions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)


class FeatureActivity(Base):
    """Accepted changes per business, feature, day and action: usage numbers for parts and daily limits.
    Written in the request's own transaction, so a change that fails is not counted."""

    __tablename__ = "feature_activity"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    feature_key: Mapped[str] = mapped_column(String(120), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    action: Mapped[str] = mapped_column(String(10), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
