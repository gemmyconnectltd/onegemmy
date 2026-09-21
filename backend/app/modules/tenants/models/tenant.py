from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class Tenant(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    logo_url: Mapped[str | None] = mapped_column(String(500))
    brand_color: Mapped[str | None] = mapped_column(String(7))
    website: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str | None] = mapped_column(String(100))

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

    # ISO 4217 code. Locked from the tenant's own side (see /api/v1/tenants
    # update_tenant) — only a platform superadmin can change it, since the
    # app doesn't convert historical amounts recorded under the old currency.
    currency: Mapped[str] = mapped_column(String(3), default="RWF")

    # VAT on/off for the whole tenant. When disabled, sales are recorded with
    # tax = 0 everywhere (receipts, reports, accounting postings). Toggleable
    # by the tenant's own admin and by a platform superadmin.
    vat_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

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
    users = relationship("User", back_populates="tenant", lazy="selectin", passive_deletes=True)
    roles = relationship("Role", back_populates="tenant", lazy="selectin", passive_deletes=True)
    branches = relationship("Branch", back_populates="tenant", lazy="selectin", passive_deletes=True)
    departments = relationship("Department", back_populates="tenant", lazy="selectin", passive_deletes=True)
