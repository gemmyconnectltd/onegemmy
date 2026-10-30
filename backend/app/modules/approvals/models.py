import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class ApprovalRequest(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """Someone asks for a change they may not make themselves; a person with approval authority decides.

    kinds: price_change, stock_adjustment, stock_transfer. (A credit sale over the limit is held on the order itself,
    status "Awaiting Approval", and is listed in the same inbox but decided through the existing order endpoints.)
    The payload holds what was asked for and what it was when asked, so a later decision is made on the facts at request time."""

    __tablename__ = "approval_requests"
    __table_args__ = (
        Index("ix_approval_requests_tenant_status", "tenant_id", "status", "created_at"),
        Index("ix_approval_requests_subject", "tenant_id", "kind", "subject_id"),
    )

    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending | approved | rejected | cancelled
    subject_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_by_name: Mapped[str | None] = mapped_column(String(255))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_by_name: Mapped[str | None] = mapped_column(String(255))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
