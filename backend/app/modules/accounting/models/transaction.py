import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# type: sale | return | expense | adjustment | manual
# status: Draft | Posted | Void


class Transaction(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "accounting_transactions"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="Draft")
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    # The ledger currency these lines are in = the tenant's base currency when posted. Lines are
    # always base-currency; recording it here means a ledger can never be silently re-read in a
    # different currency (see the base-currency change guard).
    currency_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="RESTRICT"), nullable=True
    )

    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="SET NULL"), nullable=True
    )
    return_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_returns.id", ondelete="SET NULL"), nullable=True
    )
    purchase_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    order = relationship("Order", foreign_keys=[order_id], lazy="noload")
    return_ = relationship("Return", foreign_keys=[return_id], lazy="noload")
    creator = relationship("User", foreign_keys=[created_by], lazy="noload")
    lines = relationship("TransactionLine", back_populates="transaction", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_accounting_transactions_tenant_ref", "tenant_id", "reference", unique=True),
        Index("ix_accounting_transactions_tenant_id", "tenant_id"),
        Index("ix_accounting_transactions_tenant_branch_date", "tenant_id", "branch_id", "transaction_date"),
        Index("ix_accounting_transactions_tenant_posted_date", "tenant_id", "status", "transaction_date"),
        Index("ix_accounting_transactions_order_id", "order_id"),
        Index("ix_accounting_transactions_purchase_id", "purchase_id"),
        Index("ix_accounting_transactions_type_status", "tenant_id", "type", "status"),
    )
