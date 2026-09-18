import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# status: Pending | Approved | Rejected


class PurchaseRequisition(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """An internal request for supplies, raised before any supplier/PO is
    involved — separate from PurchaseOrder, which is the actual order sent
    to a supplier once a request (or a direct need) is approved."""

    __tablename__ = "purchase_requisitions"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(12, 2), default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    department = relationship("Department", lazy="select")
    requester = relationship("User", foreign_keys=[requested_by], lazy="select")
    decider = relationship("User", foreign_keys=[decided_by], lazy="select")

    __table_args__ = (
        Index("uq_purchase_requisitions_tenant_ref", "tenant_id", "reference", unique=True),
        Index("ix_purchase_requisitions_tenant_id", "tenant_id"),
        Index("ix_purchase_requisitions_tenant_status", "tenant_id", "status"),
    )
