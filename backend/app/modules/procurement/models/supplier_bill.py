import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# status: Unpaid | PartiallyPaid | Paid


class SupplierBill(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """The financial liability created when goods are received against a
    Purchase Order — separate from the PO itself (a commitment, no liability
    until goods actually arrive) and from a SupplierPayment (money that
    settles some or all of this liability)."""

    __tablename__ = "procurement_supplier_bills"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Unpaid")
    bill_date: Mapped[date] = mapped_column(Date, nullable=False)

    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_suppliers.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    purchase_order = relationship("PurchaseOrder", lazy="select")
    supplier = relationship("Supplier", foreign_keys=[supplier_id], lazy="select")
    payments = relationship("SupplierPayment", back_populates="bill", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_supplier_bills_tenant_ref", "tenant_id", "reference", unique=True),
        Index("ix_supplier_bills_tenant_id", "tenant_id"),
        Index("ix_supplier_bills_purchase_order_id", "purchase_order_id"),
        Index("ix_supplier_bills_tenant_status", "tenant_id", "status"),
    )


class SupplierPayment(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A single payment applied against a SupplierBill. Full payment is one
    row equal to the bill's remaining balance; partial payment is however
    many rows it takes to reach it."""

    __tablename__ = "procurement_supplier_payments"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    bill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("procurement_supplier_bills.id", ondelete="CASCADE"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    bill = relationship("SupplierBill", back_populates="payments")

    __table_args__ = (
        Index("uq_supplier_payments_tenant_ref", "tenant_id", "reference", unique=True),
        Index("ix_supplier_payments_tenant_id", "tenant_id"),
        Index("ix_supplier_payments_bill_id", "bill_id"),
    )
