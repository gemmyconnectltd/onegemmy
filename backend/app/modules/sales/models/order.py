import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Order(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "sales_orders"

    order_number: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ordered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"), nullable=True
    )
    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_deals.id", ondelete="SET NULL"), nullable=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    customer = relationship("Customer", back_populates="orders", lazy="joined")
    deal = relationship("Deal", back_populates="orders", lazy="joined")
    branch = relationship("Branch", foreign_keys=[branch_id], lazy="joined")
    creator = relationship("User", foreign_keys=[created_by], lazy="joined")
    items = relationship("OrderItem", back_populates="order", lazy="selectin", cascade="all, delete-orphan")
    returns = relationship("Return", back_populates="order", lazy="selectin")

    __table_args__ = (
        Index("uq_sales_orders_tenant_number", "tenant_id", "order_number", unique=True),
        Index("ix_sales_orders_tenant_id", "tenant_id"),
        Index("ix_sales_orders_customer_id", "customer_id"),
        Index("ix_sales_orders_tenant_status", "tenant_id", "status"),
    )
