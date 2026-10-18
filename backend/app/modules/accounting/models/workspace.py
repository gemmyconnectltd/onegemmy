"""Accounting workflow records; posted transactions remain the money source of truth."""
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class AccountingPreference(TenantScopedMixin, Base):
    __tablename__ = "accounting_preferences"
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    fiscal_start_month: Mapped[int] = mapped_column(Integer, default=1)


class FinancialSnapshot(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "accounting_report_snapshots"
    kind: Mapped[str] = mapped_column(String(40))
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    data: Mapped[dict] = mapped_column(JSONB, default=dict)
    __table_args__ = (Index("ix_accounting_snapshots_tenant_created", "tenant_id", "created_at"),)


class FinancialSnapshotRow(TenantScopedMixin, Base):
    __tablename__ = "accounting_report_rows"
    snapshot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounting_report_snapshots.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (Index("ix_accounting_report_rows_tenant_snapshot", "tenant_id", "snapshot_id", "position"),)


class BankReconciliation(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "accounting_bank_reconciliations"
    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounting_accounts.id", ondelete="RESTRICT"))
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="RESTRICT"))
    as_of: Mapped[date] = mapped_column(Date)
    statement_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    ledger_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    reference: Mapped[str] = mapped_column(String(100))
    notes: Mapped[str] = mapped_column(String(1000), default="")
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    __table_args__ = (
        Index("ix_accounting_reconciliation_tenant_account", "tenant_id", "account_id", "as_of"),
        UniqueConstraint("tenant_id", "reference"),
    )


class FixedAsset(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "accounting_fixed_assets"
    reference: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(255))
    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="RESTRICT"))
    acquisition_date: Mapped[date] = mapped_column(Date)
    cost: Mapped[Decimal] = mapped_column(Numeric(18, 2))
    salvage: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    life_months: Mapped[int] = mapped_column(Integer)
    asset_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounting_accounts.id", ondelete="RESTRICT"))
    depreciation_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounting_accounts.id", ondelete="RESTRICT"))
    expense_account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounting_accounts.id", ondelete="RESTRICT"))
    acquisition_transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounting_transactions.id", ondelete="RESTRICT"))
    depreciated_through: Mapped[date | None] = mapped_column(Date)
    accumulated: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=0)
    disposal_proceeds: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    disposed_on: Mapped[date | None] = mapped_column(Date)
    disposal_transaction_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("accounting_transactions.id", ondelete="RESTRICT"))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    __table_args__ = (
        UniqueConstraint("tenant_id", "reference"),
        Index("ix_accounting_assets_tenant_branch", "tenant_id", "branch_id", "acquisition_date"),
    )


class JournalSequence(TenantScopedMixin, Base):
    __tablename__ = "accounting_journal_sequences"
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, nullable=False)
