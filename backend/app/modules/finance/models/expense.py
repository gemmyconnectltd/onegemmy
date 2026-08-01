import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# category: Rent | Utilities | Salaries | Supplies | Other
# status: Pending | Approved | Rejected


class Expense(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "finance_expenses"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="Other")
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="Pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("finance_accounts.id", ondelete="SET NULL"), nullable=True
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

    account = relationship("Account", back_populates="expenses", lazy="joined")
    order = relationship("Order", foreign_keys=[order_id], lazy="joined")
    approver = relationship("User", foreign_keys=[approved_by], lazy="joined")
    creator = relationship("User", foreign_keys=[created_by], lazy="joined")

    __table_args__ = (
        Index("uq_finance_expenses_tenant_ref", "tenant_id", "reference", unique=True),
        Index("ix_finance_expenses_tenant_id", "tenant_id"),
        Index("ix_finance_expenses_tenant_status", "tenant_id", "status"),
        Index("ix_finance_expenses_account_id", "account_id"),
    )
