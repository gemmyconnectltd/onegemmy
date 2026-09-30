import uuid

from sqlalchemy import ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class EmployeeService(UUIDPKMixin, TimestampMixin, Base):
    """Which HR employees can perform which catalog Service, and what they
    earn for it. Deliberately not tenant-scoped (like sales_order_items /
    repair_job_parts) — both employee_id and service_id already belong to a
    tenant-scoped row, so this junction's tenant boundary comes from theirs;
    the service layer still always verifies both sides belong to the acting
    tenant before writing.

    This is the ONLY place Services extends HR — no employee_id/user data is
    duplicated here, just the service-specific facts HR has no reason to
    know about (per the "reuse HR, don't duplicate it" instruction)."""

    __tablename__ = "employee_services"

    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id", ondelete="CASCADE"), nullable=False
    )
    # "percentage" | "fixed" | None (no commission configured for this pair)
    commission_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # A percentage (0-100) if commission_type="percentage", or a money
    # amount if "fixed". Meaningless (and ignored) when commission_type is None.
    commission_value: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    # Some staff take longer/shorter than the service's own default — null
    # means "use the service's duration_minutes as-is".
    duration_override_minutes: Mapped[int | None] = mapped_column(nullable=True)

    employee = relationship("Employee", lazy="joined")
    service = relationship("Service", back_populates="employees", lazy="joined")

    __table_args__ = (
        UniqueConstraint("employee_id", "service_id", name="uq_employee_services_employee_service"),
        Index("ix_employee_services_employee_id", "employee_id"),
        Index("ix_employee_services_service_id", "service_id"),
    )
