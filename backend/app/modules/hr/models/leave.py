import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class LeaveRequest(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "hr_leave_requests"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    leave_type: Mapped[str] = mapped_column(String(30), nullable=False)  # Annual | Sick | Maternity | Unpaid | Study
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    days: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="Pending")  # Pending | Approved | Rejected
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    employee = relationship("Employee", back_populates="leave_requests", lazy="joined")
    approver = relationship("User", foreign_keys=[approved_by], lazy="joined")

    __table_args__ = (
        Index("ix_hr_leave_requests_tenant_id", "tenant_id"),
        Index("ix_hr_leave_requests_status", "tenant_id", "status"),
    )
