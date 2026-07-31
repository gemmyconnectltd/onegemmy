from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Unit(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "inventory_units"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    abbreviation: Mapped[str | None] = mapped_column(String(20))

    products = relationship("Product", back_populates="unit", lazy="selectin")
