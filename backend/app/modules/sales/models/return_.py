import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Return(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "sales_returns"

    return_number: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    refund_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")
    return_date: Mapped[date] = mapped_column(Date, nullable=False)

    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="SET NULL"), nullable=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"), nullable=True
    )
    processed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    order = relationship("Order", back_populates="returns", lazy="joined")
    customer = relationship("Customer", back_populates="returns", lazy="joined")
    processor = relationship("User", foreign_keys=[processed_by], lazy="joined")
    items = relationship("ReturnItem", back_populates="return_", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_sales_returns_tenant_number", "tenant_id", "return_number", unique=True),
        Index("ix_sales_returns_tenant_id", "tenant_id"),
        Index("ix_sales_returns_order_id", "order_id"),
        Index("ix_sales_returns_tenant_status", "tenant_id", "status"),
    )
