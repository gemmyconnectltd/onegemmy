import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Service(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A catalog entry for the Services module (haircut, massage, manicure —
    whatever an appointment/walk-in business sells by the job rather than by
    the unit). Deliberately generic: no salon-specific concept lives on this
    model, only name/category/price/duration/cost, mirroring
    inventory_products' own shape so Services feels native to Pesaa rather
    than a bolted-on app. Tenant-wide like Product (not branch-scoped) —
    availability per branch is a later refinement, not a Phase 1 blocker.

    Who can perform it and their commission rule live on EmployeeService, not
    here — a service's price doesn't change based on who performs it, but
    who's eligible and what they earn does, per employee."""

    __tablename__ = "services"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # VAT-inclusive, same convention as inventory_products.price — this
    # platform's VAT is applied uniformly at the tenant level (Tenant.vat_enabled),
    # not configured per catalog item.
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    # Optional internal cost (product/labor cost basis) — distinct from
    # consumables, which are tracked as actual stock deductions via
    # ServiceConsumable once that lands.
    cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    image_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_categories.id", ondelete="SET NULL"), nullable=True
    )

    category = relationship("ServiceCategory", back_populates="services", lazy="joined")
    employees = relationship("EmployeeService", back_populates="service", lazy="selectin")

    __table_args__ = (
        Index("ix_services_tenant_id", "tenant_id"),
        Index("ix_services_tenant_category", "tenant_id", "category_id"),
        Index("ix_services_tenant_active", "tenant_id", "is_active"),
    )
