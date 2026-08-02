import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Employee(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "hr_employees"

    employee_code: Mapped[str] = mapped_column(String(20), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    job_title: Mapped[str | None] = mapped_column(String(100))
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL")
    )
    employment_status: Mapped[str] = mapped_column(String(20), default="Active")  # Active | On Leave | Terminated
    hire_date: Mapped[date | None] = mapped_column(Date)
    salary: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    department = relationship("Department", lazy="joined")
    attendance_records = relationship("Attendance", back_populates="employee", lazy="noload")
    leave_requests = relationship("LeaveRequest", back_populates="employee", lazy="noload")
    payroll_entries = relationship("PayrollEntry", back_populates="employee", lazy="noload")

    __table_args__ = (
        Index("uq_hr_employees_tenant_code", "tenant_id", "employee_code", unique=True),
        Index("ix_hr_employees_tenant_id", "tenant_id"),
        Index("ix_hr_employees_department_id", "department_id"),
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()
