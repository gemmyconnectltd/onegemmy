import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

QUEUE_STATUSES = ["waiting", "assigned", "in_service", "completed", "removed"]


class QueueEntry(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A same-day walk-in, waiting for or currently receiving a service —
    the fast path a receptionist uses instead of a full Appointment booking.
    Like Appointment, `customer_name` is a snapshot so a guest with no
    Customer record is still a first-class row; `customer_id` links it when
    the walk-in is a known customer. `checked_in_at`/`started_at`/
    `completed_at` mark the queue's own timeline distinctly from
    `created_at`/`updated_at` (row bookkeeping)."""

    __tablename__ = "queue_entries"

    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"), nullable=True
    )
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id", ondelete="SET NULL"), nullable=True
    )
    service_name: Mapped[str] = mapped_column(String(255), nullable=False)
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="waiting")
    checked_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    branch = relationship("Branch", lazy="joined")
    customer = relationship("Customer", lazy="joined")
    service = relationship("Service", lazy="joined")
    employee = relationship("Employee", lazy="joined")

    __table_args__ = (
        Index("ix_queue_entries_tenant_id", "tenant_id"),
        Index("ix_queue_entries_tenant_status", "tenant_id", "status"),
    )
