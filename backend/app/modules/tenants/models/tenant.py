import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Index, Numeric, String, false
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class Tenant(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Who suspended / reactivated the business, when, and why (platform admins only; kept as the last action).
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    suspension_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    reactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reactivated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    logo_url: Mapped[str | None] = mapped_column(String(500))
    brand_color: Mapped[str | None] = mapped_column(String(7))
    website: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))

    # Migration preserves legacy access; newly created ORM tenants join the managed cohort.
    billing_required: Mapped[bool] = mapped_column(Boolean, default=True, server_default=false())

    subscription_plan: Mapped[str] = mapped_column(String(50), default="free")
    subscription_status: Mapped[str] = mapped_column(String(50), default="active")

    # Collected on the register form's "Business information" step
    # (see frontend /register step 2). All optional — a superadmin filling
    # in TenantCreate directly won't have these, and older tenants predate
    # them entirely.
    business_type: Mapped[str | None] = mapped_column(String(50))  # sole | partnership | llc | unregistered
    industry: Mapped[str | None] = mapped_column(String(100))
    business_category: Mapped[str | None] = mapped_column(String(100))
    employee_count: Mapped[str | None] = mapped_column(String(20))  # a range label, e.g. "2-5", not a single number
    business_location: Mapped[str | None] = mapped_column(String(255))
    heard_about: Mapped[str | None] = mapped_column(String(100))
    referral_code: Mapped[str | None] = mapped_column(String(50))
    # Anonymous id of the website visitor who registered this business (first-touch attribution). Not personal data.
    attribution_visitor_id: Mapped[str | None] = mapped_column(String(64), index=True)
    # How the business wants Pesaa to reach it first: "email" (the owner's login email), "phone" (a call to the
    # business phone above) or "whatsapp" (a WhatsApp message to that same number). Chosen at registration and
    # editable in Settings; shown to staff who review a signup or answer support so they use the channel asked for.
    preferred_contact: Mapped[str] = mapped_column(String(10), nullable=False, default="email", server_default="email")

    # Marketing opt-out: set when the business uses the unsubscribe link or replies STOP. Every outreach send skips an
    # opted-out business; support replies to a conversation the business started are not marketing and are unaffected.
    marketing_opt_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    marketing_opt_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ISO 4217 code. Locked from the tenant's own side (see /api/v1/tenants
    # update_tenant) — only a platform superadmin can change it, since the
    # app doesn't convert historical amounts recorded under the old currency.
    currency: Mapped[str] = mapped_column(String(3), default="RWF")

    # VAT on/off for the whole tenant. When disabled, sales are recorded with
    # tax = 0 everywhere (receipts, reports, accounting postings). Toggleable
    # by the tenant's own admin and by a platform superadmin.
    vat_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Most NEW credit (unpaid balance) one customer may be granted in a single day, in the base currency.
    # Null = no limit (the behaviour before this existed). Set by someone holding credit:approve (GM/CEO).
    credit_daily_limit: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")

    # Whether this tenant operates multiple branches. Controls branch-related
    # UI visibility on the tenant's own dashboard.
    multi_branch: Mapped[bool] = mapped_column(Boolean, default=False)

    # Per-tenant feature overrides, e.g. {"hr": false, "pos": true}.
    # Effective value = catalog default merged with these overrides.
    features: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Usage quotas, e.g. {"max_users": 10, "max_branches": 3}. None/absent = unlimited.
    limits: Mapped[dict] = mapped_column(JSONB, default=dict)

    # passive_deletes=True: let the DB's ON DELETE CASCADE (see the tenant_id
    # FK on each child model) actually delete these rows when a tenant is
    # deleted. Without it, SQLAlchemy manages the relationship itself and
    # first UPDATEs tenant_id to NULL on every loaded child — silently
    # orphaning them instead of removing them, since tenant_id is nullable.
    __table_args__ = (
        # Super-admin analytics: signups per period, newest-first lists.
        Index("ix_tenants_created_at", "created_at"),
        # Global dashboard filters.
        Index("ix_tenants_country", "country"),
        Index("ix_tenants_industry", "industry"),
        Index("ix_tenants_business_type", "business_type"),
    )

    users = relationship("User", back_populates="tenant", lazy="selectin", passive_deletes=True)
    roles = relationship("Role", back_populates="tenant", lazy="selectin", passive_deletes=True)
    branches = relationship("Branch", back_populates="tenant", lazy="selectin", passive_deletes=True)
    departments = relationship("Department", back_populates="tenant", lazy="selectin", passive_deletes=True)
