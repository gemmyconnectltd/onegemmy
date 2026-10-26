"""Debt-only records: opening balances without a sale or purchase, and the write-off / void audit trail.

Credit sales and supplier bills stay the source of truth for their own debts; these tables only hold what has no
source document, and the adjustments that must never rewrite a sale or purchase."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import DocumentCurrencyMixin, TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class ManualDebt(UUIDPKMixin, TenantScopedMixin, TimestampMixin, DocumentCurrencyMixin, Base):
    """An opening-balance receivable or a direct payable. No stock moves and it is not a product sale."""
    __tablename__ = "accounting_manual_debts"

    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # receivable | payable
    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="RESTRICT"))
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_suppliers.id", ondelete="RESTRICT"))
    branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        Index("uq_accounting_manual_debts_ref", "tenant_id", "reference", unique=True),
        Index("ix_accounting_manual_debts_scope", "tenant_id", "kind", "branch_id"),
    )


class ManualDebtPayment(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "accounting_manual_debt_payments"

    debt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounting_manual_debts.id", ondelete="RESTRICT"), nullable=False)
    reference: Mapped[str] = mapped_column(String(60), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(20))
    reference_number: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        Index("uq_accounting_manual_debt_payments_ref", "tenant_id", "reference", unique=True),
        Index("ix_accounting_manual_debt_payments_debt", "tenant_id", "debt_id"),
    )


class DebtAdjustment(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A write-off (amount forgiven, reason required) or a void (debt removed from the books, reason required).
    The underlying sale / bill is never edited; the projection applies these."""
    __tablename__ = "accounting_debt_adjustments"

    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(10), nullable=False)  # write_off | void
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    actor_name: Mapped[str | None] = mapped_column(String(255))

    __table_args__ = (Index("ix_accounting_debt_adjustments_doc", "tenant_id", "kind", "document_id"),)
