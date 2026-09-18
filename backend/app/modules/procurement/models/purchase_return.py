import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

# status: Processing | Refunded | Replaced


class PurchaseReturn(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """Goods sent back to a supplier from a received Purchase Order — the
    inverse of a customer Return (sales/models/return_.py), which is stock
    coming back in from a customer."""

    __tablename__ = "purchase_returns"

    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Processing")
    return_date: Mapped[date] = mapped_column(Date, nullable=False)

    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="SET NULL"), nullable=True
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_product_variants.id", ondelete="SET NULL"), nullable=True
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    processed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    purchase_order = relationship("PurchaseOrder", lazy="select")

    __table_args__ = (
        Index("uq_purchase_returns_tenant_ref", "tenant_id", "reference", unique=True),
        Index("ix_purchase_returns_tenant_id", "tenant_id"),
        Index("ix_purchase_returns_purchase_order_id", "purchase_order_id"),
    )
