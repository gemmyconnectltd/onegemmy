import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text, func
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
    client_order_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # POS payment capture — how the customer paid, what they handed over in
    # cash, and the change given back. Null for non-POS orders and for any
    # order placed before this was tracked.
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    amount_tendered: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    change_due: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    # Credit sales / partial payments. `amount_paid` is a running total, the
    # only place it is ever written is inside the same DB transaction as an
    # OrderPayment insert (see sales/service/order_payment.py) — so it can
    # never drift from SUM(payments). Payment status (Unpaid/PartiallyPaid/
    # Paid) and overdue-ness are deliberately NOT stored columns: they're
    # derived from amount_paid/total/due_date wherever they're needed
    # (OrderRead, repository filters), so there is exactly one source of
    # truth and no cached status that can go stale. `due_date` is only
    # meaningful once there's an outstanding balance; null otherwise.
    amount_paid: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

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

    customer = relationship("Customer", back_populates="orders", lazy="select")
    deal = relationship("Deal", back_populates="orders", lazy="select")
    branch = relationship("Branch", foreign_keys=[branch_id], lazy="select")
    creator = relationship("User", foreign_keys=[created_by], lazy="select")
    items = relationship("OrderItem", back_populates="order", lazy="selectin", cascade="all, delete-orphan")
    returns = relationship("Return", back_populates="order", lazy="selectin")
    payments = relationship(
        "OrderPayment", back_populates="order", lazy="selectin",
        order_by="OrderPayment.paid_at.desc()", cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("uq_sales_orders_tenant_number", "tenant_id", "order_number", unique=True),
        Index("uq_sales_orders_tenant_client", "tenant_id", "client_order_id", unique=True),
        Index("ix_sales_orders_tenant_id", "tenant_id"),
        Index("ix_sales_orders_customer_id", "customer_id"),
        Index("ix_sales_orders_tenant_status", "tenant_id", "status"),
    )
