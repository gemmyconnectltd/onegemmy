import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class InventoryBatch(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A received batch/lot of a product with expiry and quantity tracking."""
    __tablename__ = "inventory_batches"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_product_variants.id", ondelete="SET NULL"), nullable=True
    )
    purchase_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id", ondelete="SET NULL"), nullable=True
    )

    batch_number: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    quantity_remaining: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)

    manufactured_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_suppliers.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product = relationship("Product", foreign_keys=[product_id], lazy="joined")
    variant = relationship("ProductVariant", foreign_keys=[variant_id], lazy="joined")
    supplier = relationship("Supplier", foreign_keys=[supplier_id], lazy="joined")

    __table_args__ = (
        Index("uq_inventory_batches_tenant_number", "tenant_id", "batch_number", unique=True),
        Index("ix_inventory_batches_tenant_product", "tenant_id", "product_id"),
        Index("ix_inventory_batches_expiry", "tenant_id", "expiry_date"),
    )
