import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class PayrollEntry(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "hr_payroll_entries"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    base_salary: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    bonus: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    deductions: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    net_pay: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="Pending")  # Pending | Paid
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    employee = relationship("Employee", back_populates="payroll_entries", lazy="joined")

    __table_args__ = (
        Index("uq_hr_payroll_tenant_employee_period", "tenant_id", "employee_id", "period", unique=True),
        Index("ix_hr_payroll_tenant_id", "tenant_id"),
        Index("ix_hr_payroll_period", "period"),
    )
