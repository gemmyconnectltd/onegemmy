
from sqlalchemy import Boolean, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Customer(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "sales_customers"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_type: Mapped[str] = mapped_column(String(20), default="individual")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    deals = relationship("Deal", back_populates="customer", lazy="selectin")
    orders = relationship("Order", back_populates="customer", lazy="selectin")
    returns = relationship("Return", back_populates="customer", lazy="selectin")

    __table_args__ = (
        Index("ix_sales_customers_tenant_id", "tenant_id"),
        Index("uq_sales_customers_tenant_email", "tenant_id", "email", unique=True, postgresql_where="email IS NOT NULL"),
    )
