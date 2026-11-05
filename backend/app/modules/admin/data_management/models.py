"""Data Management: the plan for a data operation, what happened to each record, and saved filters.

An operation is planned first (the exact records, who is eligible, why not) and only then executed. The plan, the approval and the outcome of
every record are kept for good: the table cannot be deleted from, and every change is also written to the append-only audit log.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin

OPERATIONS = ("archive", "delete", "clean_test", "correct", "reset")
STATUSES = ("Prepared", "PendingApproval", "Approved", "Rejected", "Executing", "Completed", "PartiallyCompleted", "Failed", "Expired", "Cancelled")


class DataOperation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "data_operations"

    reference: Mapped[str] = mapped_column(String(30), nullable=False)
    # No cascade: the history of what a platform administrator did to a business must outlive any change to that business.
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False)
    tenant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    module: Mapped[str] = mapped_column(String(30), nullable=False)
    operation: Mapped[str] = mapped_column(String(15), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Prepared")
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    selection: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # how the records were chosen
    record_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)  # the exact set, fixed at preview
    versions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # id -> updated_at at preview; a changed record is not touched
    analysis: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # eligible, blocked (with reasons), related records, restrictions
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # operation settings (a correction's new values, a closing date)
    plan_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    approval_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_name: Mapped[str | None] = mapped_column(String(255))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    decided_by_name: Mapped[str | None] = mapped_column(String(255))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(String(500))
    # True when the administrator who requested the operation also approved it (allowed only while the platform does not require a second approver).
    self_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    executed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    executed_by_name: Mapped[str | None] = mapped_column(String(255))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    result: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    affected_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("uq_data_operations_reference", "reference", unique=True),
        Index("ix_data_operations_tenant", "tenant_id", "created_at"),
        Index("ix_data_operations_status", "status"),
    )


class DataOperationItem(UUIDPKMixin, Base):
    """What happened to one record. `snapshot` keeps the key fields of a record before it was removed, as an audit reference (it is not a restore point)."""
    __tablename__ = "data_operation_items"

    operation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("data_operations.id", ondelete="RESTRICT"), nullable=False)
    record_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255))
    outcome: Mapped[str] = mapped_column(String(12), nullable=False)  # affected | blocked | failed | skipped
    message: Mapped[str | None] = mapped_column(Text)
    snapshot: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_data_operation_items_operation", "operation_id", "outcome"),)


class DataManagementRequest(UUIDPKMixin, TimestampMixin, Base):
    """A business owner's date-bounded request for platform review; it never authorizes deletion."""

    __tablename__ = "data_management_requests"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False)
    module: Mapped[str] = mapped_column(String(30), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Submitted")
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    requested_by_name: Mapped[str | None] = mapped_column(String(255))
    operation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("data_operations.id", ondelete="SET NULL"))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    review_note: Mapped[str | None] = mapped_column(Text)
    # Requests asked for together (one date range, several modules) share a batch id so they can be reviewed together.
    batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    __table_args__ = (
        Index("ix_data_management_requests_batch", "batch_id"),
        Index("ix_data_management_requests_tenant_created", "tenant_id", "created_at"),
        Index("ix_data_management_requests_status_created", "status", "created_at"),
    )


class DataSavedFilter(UUIDPKMixin, TimestampMixin, Base):
    """A reusable set of filters. Saving one authorises nothing: every operation still gets a fresh preview."""
    __tablename__ = "data_saved_filters"

    admin_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    module: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (Index("ix_data_saved_filters_admin", "admin_id", "module"),)
