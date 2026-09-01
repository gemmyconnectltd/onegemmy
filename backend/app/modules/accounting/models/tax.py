import uuid
from datetime import date

from sqlalchemy import Boolean, Date, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class TaxConfig(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """Rwanda tax configuration for different tax types"""
    __tablename__ = "accounting_tax_configs"

    tax_type: Mapped[str] = mapped_column(String(50), nullable=False)  # vat | paye | withholding | consumption | corporate | personal_income
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # Display name
    rate: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)  # Tax rate (e.g., 18.00 for VAT)
    rate_type: Mapped[str] = mapped_column(String(20), nullable=False, default="percentage")  # percentage | fixed
    min_threshold: Mapped[float] = mapped_column(Numeric(14, 2), default=0)  # Minimum amount subject to tax
    max_threshold: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)  # Maximum amount (null = no limit)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)  # null = currently active

    __table_args__ = (
        Index("uq_accounting_tax_configs_tenant_type", "tenant_id", "tax_type", unique=True),
        Index("ix_accounting_tax_configs_tenant_id", "tenant_id"),
        Index("ix_accounting_tax_configs_tax_type", "tax_type"),
    )


class TaxCalculation(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """Individual tax calculation records"""
    __tablename__ = "accounting_tax_calculations"

    calculation_type: Mapped[str] = mapped_column(String(50), nullable=False)  # vat | paye | withholding | consumption | corporate | personal_income
    reference_type: Mapped[str] = mapped_column(String(50), nullable=False)  # sale | expense | payroll | manual
    reference_id: Mapped[uuid.UUID | None] = mapped_column(String(36), nullable=True)  # ID of the related record
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    taxable_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    tax_rate: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    tax_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Calculated")  # Calculated | Paid | Void
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    __table_args__ = (
        Index("ix_accounting_tax_calculations_tenant_id", "tenant_id"),
        Index("ix_accounting_tax_calculations_period", "period"),
        Index("ix_accounting_tax_calculations_type_status", "calculation_type", "status"),
    )


class TaxPayment(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """Tax payment records for tracking payments to RRA"""
    __tablename__ = "accounting_tax_payments"

    payment_reference: Mapped[str] = mapped_column(String(50), nullable=False)  # Unique payment reference
    tax_type: Mapped[str] = mapped_column(String(50), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_method: Mapped[str] = mapped_column(String(50), nullable=False)  # bank_transfer | mobile_money | cash
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")  # Pending | Confirmed | Rejected
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    __table_args__ = (
        Index("uq_accounting_tax_payments_tenant_ref", "tenant_id", "payment_reference", unique=True),
        Index("ix_accounting_tax_payments_tenant_id", "tenant_id"),
        Index("ix_accounting_tax_payments_period", "period"),
    )
