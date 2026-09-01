import uuid

from sqlalchemy import ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Budget(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "accounting_budgets"

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounting_accounts.id", ondelete="CASCADE"), nullable=False
    )
    period: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. 2025-07
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    spent: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    account = relationship("Account", back_populates="budgets", lazy="joined")

    __table_args__ = (
        Index("uq_accounting_budgets_tenant_account_period", "tenant_id", "account_id", "period", unique=True),
        Index("ix_accounting_budgets_tenant_id", "tenant_id"),
        Index("ix_accounting_budgets_account_id", "account_id"),
    )
