import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Attendance(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "hr_attendance"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in: Mapped[str | None] = mapped_column(String(5))  # HH:MM
    check_out: Mapped[str | None] = mapped_column(String(5))  # HH:MM
    status: Mapped[str] = mapped_column(String(20), default="Present")  # Present | Late | Absent | Half Day

    employee = relationship("Employee", back_populates="attendance_records", lazy="joined")

    __table_args__ = (
        Index("uq_hr_attendance_tenant_employee_date", "tenant_id", "employee_id", "date", unique=True),
        Index("ix_hr_attendance_tenant_id", "tenant_id"),
        Index("ix_hr_attendance_date", "date"),
    )
