import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# status: Completed | Reversed


class OrderPayment(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A single payment applied against an Order's outstanding balance —
    mirrors procurement's SupplierBill/SupplierPayment shape on the
    receivable side. Full payment at checkout is one row equal to the
    order's total; a credit sale collects nothing at checkout (no row is
    created); a partial payment is however many rows it takes to reach the
    total. `status` is never hard-deleted to "Reversed" — see
    reverse_payment() — so the row (and the audit trail pointing at it)
    survives a correction, same principle as accounting Transactions being
    voided rather than deleted."""

    __tablename__ = "sales_order_payments"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="Completed")
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # A client-generated key (one per Record Payment submit) — replaying it
    # (double-click, slow network retry, browser resubmit) returns the
    # already-recorded payment instead of creating a second one. Same
    # idempotency pattern as Order.client_order_id.
    client_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"), nullable=True
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True
    )
    received_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    accounting_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_transactions.id", ondelete="SET NULL"), nullable=True
    )

    # Reversal audit trail — who reversed it, when, why. Left null on a
    # payment that's never been reversed.
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reversed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    order = relationship("Order", back_populates="payments")
    customer = relationship("Customer", foreign_keys=[customer_id], lazy="joined")
    branch = relationship("Branch", foreign_keys=[branch_id], lazy="joined")
    receiver = relationship("User", foreign_keys=[received_by], lazy="joined")
    reverser = relationship("User", foreign_keys=[reversed_by], lazy="joined")

    __table_args__ = (
        Index("uq_sales_order_payments_tenant_ref", "tenant_id", "reference", unique=True),
        Index(
            "uq_sales_order_payments_tenant_client", "tenant_id", "client_payment_id",
            unique=True, postgresql_where="client_payment_id IS NOT NULL",
        ),
        Index("ix_sales_order_payments_tenant_id", "tenant_id"),
        Index("ix_sales_order_payments_order_id", "order_id"),
        Index("ix_sales_order_payments_customer_id", "customer_id"),
    )
