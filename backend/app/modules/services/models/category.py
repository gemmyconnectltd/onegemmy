from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class ServiceCategory(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """Configurable grouping for the Service Catalog — "Hair", "Nails",
    "Massage", whatever fits the business. Never hard-coded (see
    Service model docstring): a generic appointment/service platform, not a
    salon-specific one."""

    __tablename__ = "service_categories"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    services = relationship("Service", back_populates="category", lazy="selectin")
