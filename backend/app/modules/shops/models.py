from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.tenancy.models import TenantScopedMixin


class Shop(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "shops"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="active")

    tenant = relationship("Tenant", back_populates="shops", lazy="joined")
    users = relationship("User", back_populates="shop_rel", lazy="selectin")
