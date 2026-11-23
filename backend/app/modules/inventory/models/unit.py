from sqlalchemy import Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Unit(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "inventory_units"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    abbreviation: Mapped[str | None] = mapped_column(String(20))

    products = relationship("Product", foreign_keys="Product.unit_id", back_populates="unit", lazy="selectin")

    # One unit per name in a business, case and spaces ignored (migration 7c4e2a9b1d05 merged the duplicates).
    __table_args__ = (Index("uq_inventory_units_tenant_name", "tenant_id", func.lower(func.btrim(name)), unique=True),)
