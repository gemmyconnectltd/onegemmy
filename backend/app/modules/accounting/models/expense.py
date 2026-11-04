import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import DocumentCurrencyMixin, TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# category: Rent | Utilities | Salaries | Supplies | Other
# status: Pending | Approved | Rejected


class Expense(UUIDPKMixin, TenantScopedMixin, TimestampMixin, DocumentCurrencyMixin, Base):
    __tablename__ = "accounting_expenses"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    # `amount` is in `currency_code`; this is its base-currency value at the frozen exchange_rate.
    base_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="Other")
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="Pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"))
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_suppliers.id", ondelete="SET NULL"))
    payment_method: Mapped[str] = mapped_column(String(20), default="Cash", server_default="Cash")
    reference_number: Mapped[str | None] = mapped_column(String(100))
    client_reference: Mapped[str | None] = mapped_column(String(50))
    receipt_key: Mapped[str | None] = mapped_column(String(100))
    receipt_name: Mapped[str | None] = mapped_column(String(255))
    receipt_type: Mapped[str | None] = mapped_column(String(50))

    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_accounts.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="SET NULL"), nullable=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Booked now, paid later: the credit goes to Accounts Payable until "paid" is recorded.
    on_credit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Money the supplier gave back after the expense was approved (a refund or credit note), in base currency.
    refunded_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0, server_default="0")
    reversed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reversed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reversal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reversal_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_transactions.id", ondelete="SET NULL"), nullable=True
    )

    account = relationship("Account", back_populates="expenses", lazy="select")
    order = relationship("Order", foreign_keys=[order_id], lazy="noload")
    approver = relationship("User", foreign_keys=[approved_by], lazy="noload")
    creator = relationship("User", foreign_keys=[created_by], lazy="noload")

    __table_args__ = (
        Index("uq_accounting_expenses_tenant_ref", "tenant_id", "reference", unique=True),
        Index("ix_accounting_expenses_tenant_id", "tenant_id"),
        Index("ix_accounting_expenses_tenant_status", "tenant_id", "status"),
        Index("ix_accounting_expenses_account_id", "account_id"),
        Index("ix_expenses_tenant_date", "tenant_id", "expense_date"),
        Index("ix_expenses_tenant_branch_date", "tenant_id", "branch_id", "expense_date"),
        Index("ix_expenses_tenant_category_date", "tenant_id", "category", "expense_date"),
        Index("ix_expenses_tenant_method_date", "tenant_id", "payment_method", "expense_date"),
        Index("uq_expenses_tenant_client", "tenant_id", "client_reference", unique=True),
    )


class ExpenseCategory(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "accounting_expense_categories"
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    __table_args__ = (Index("uq_expense_categories_tenant_name", "tenant_id", "name", unique=True),)


class RecurringExpense(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A template that creates a pending expense each week or month (rent, subscriptions)."""
    __tablename__ = "accounting_recurring_expenses"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("accounting_accounts.id", ondelete="SET NULL"), nullable=True)
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_suppliers.id", ondelete="SET NULL"), nullable=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False, default="Cash", server_default="Cash")
    on_credit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    frequency: Mapped[str] = mapped_column(String(10), nullable=False)  # weekly | monthly
    next_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
