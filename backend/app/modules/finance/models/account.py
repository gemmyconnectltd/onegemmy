from sqlalchemy import Boolean, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# type: Assets | Liabilities | Equity | Revenue | Expense
# normal_balance: debit | credit


class Account(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "finance_accounts"

    code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    normal_balance: Mapped[str] = mapped_column(String(6), nullable=False)  # debit | credit
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    transaction_lines = relationship("TransactionLine", back_populates="account", lazy="noload")
    budgets = relationship("Budget", back_populates="account", lazy="noload")
    expenses = relationship("Expense", back_populates="account", lazy="noload")

    __table_args__ = (
        Index("uq_finance_accounts_tenant_code", "tenant_id", "code", unique=True),
        Index("ix_finance_accounts_tenant_id", "tenant_id"),
        Index("ix_finance_accounts_type", "tenant_id", "type"),
    )
