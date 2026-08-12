import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

JOB_STATUSES = ["received", "diagnosing", "waiting_parts", "in_repair", "ready", "delivered", "cancelled"]


class RepairJob(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "repair_jobs"

    job_number: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="received")

    # Device info
    device_type: Mapped[str] = mapped_column(String(100), nullable=False)
    device_brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    device_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    imei: Mapped[str | None] = mapped_column(String(30), nullable=True)
    device_condition: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Problem & diagnosis
    reported_issue: Mapped[str] = mapped_column(Text, nullable=False)
    diagnosis: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pricing
    estimated_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    final_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)

    # Dates
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    promised_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relations
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"), nullable=True
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    customer = relationship("Customer", foreign_keys=[customer_id], lazy="joined")
    technician = relationship("User", foreign_keys=[assigned_to], lazy="joined")
    parts = relationship("RepairJobPart", back_populates="job", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_repair_jobs_tenant_number", "tenant_id", "job_number", unique=True),
        Index("ix_repair_jobs_tenant_status", "tenant_id", "status"),
        Index("ix_repair_jobs_tenant_customer", "tenant_id", "customer_id"),
    )


class RepairJobPart(UUIDPKMixin, Base):
    __tablename__ = "repair_job_parts"

    job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("repair_jobs.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="SET NULL"), nullable=True
    )
    part_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), default=1)
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    line_total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job = relationship("RepairJob", back_populates="parts")
    product = relationship("Product", foreign_keys=[product_id], lazy="joined")

    __table_args__ = (
        Index("ix_repair_job_parts_job_id", "job_id"),
    )
