import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

APPOINTMENT_STATUSES = [
    "scheduled", "confirmed", "checked_in", "in_service", "completed", "cancelled", "no_show",
]


class Appointment(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A booked visit — one or more Services, at a scheduled time, usually with
    a named customer. `customer_name`/`customer_phone` are snapshots (like
    Order/RepairJob) so the appointment record survives a customer being
    edited or deleted; `customer_id` is set when the visitor is a known,
    existing Customer rather than a one-off booking. `scheduled_end` is
    derived from the sum of its AppointmentService durations at booking time
    and stored so staff-conflict and calendar-range queries don't need to
    join out to compute it."""

    __tablename__ = "appointments"

    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"), nullable=True
    )
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="scheduled")
    scheduled_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scheduled_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    branch = relationship("Branch", lazy="joined")
    customer = relationship("Customer", lazy="joined")
    employee = relationship("Employee", lazy="joined")
    services = relationship(
        "AppointmentService", back_populates="appointment", lazy="selectin", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_appointments_tenant_id", "tenant_id"),
        Index("ix_appointments_tenant_status", "tenant_id", "status"),
        Index("ix_appointments_tenant_start", "tenant_id", "scheduled_start"),
        Index("ix_appointments_tenant_employee", "tenant_id", "employee_id"),
    )


class AppointmentService(UUIDPKMixin, Base):
    """A service booked within an Appointment — snapshots `service_name`,
    `price` and `duration_minutes` from the Service catalog entry at booking
    time (mirroring OrderItem's `product_name` snapshot) so a later catalog
    price/duration change doesn't rewrite history. Not tenant-scoped — its
    tenant boundary comes from `appointment_id`'s parent, consistent with
    OrderItem/RepairJobPart/EmployeeService."""

    __tablename__ = "appointment_services"

    appointment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("appointments.id", ondelete="CASCADE"), nullable=False
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id", ondelete="SET NULL"), nullable=True
    )
    service_name: Mapped[str] = mapped_column(String(255), nullable=False)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True
    )
    duration_minutes: Mapped[int] = mapped_column(nullable=False, default=30)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    appointment = relationship("Appointment", back_populates="services")
    service = relationship("Service", lazy="joined")
    employee = relationship("Employee", lazy="joined")

    __table_args__ = (
        Index("ix_appointment_services_appointment_id", "appointment_id"),
        Index("ix_appointment_services_service_id", "service_id"),
    )
