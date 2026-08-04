import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# status: Draft | Received | Cancelled


class PurchaseOrder(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "purchase_orders"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Draft")
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_suppliers.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    supplier = relationship("Supplier", foreign_keys=[supplier_id], lazy="select")
    creator = relationship("User", foreign_keys=[created_by], lazy="select")
    items = relationship("PurchaseItem", back_populates="purchase_order", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_purchase_orders_tenant_ref", "tenant_id", "reference", unique=True),
        Index("ix_purchase_orders_tenant_id", "tenant_id"),
        Index("ix_purchase_orders_supplier_id", "supplier_id"),
        Index("ix_purchase_orders_tenant_status", "tenant_id", "status"),
    )
