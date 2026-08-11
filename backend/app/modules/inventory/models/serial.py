import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

SERIAL_STATUSES = ["in_stock", "reserved", "sold", "returned", "under_repair"]
WARRANTY_STATUSES = ["submitted", "approved", "rejected", "in_repair", "replaced", "refunded", "completed"]


class ProductSerial(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "inventory_product_serials"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False
    )
    variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_product_variants.id", ondelete="SET NULL"), nullable=True
    )
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False)
    imei: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_stock")
    warranty_months: Mapped[int] = mapped_column(Integer, default=0)
    warranty_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purchase_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    order_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_order_items.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product = relationship("Product", lazy="joined")
    variant = relationship("ProductVariant", lazy="joined")
    warranty_claims = relationship("WarrantyClaim", back_populates="serial", lazy="selectin")

    __table_args__ = (
        Index("ix_inventory_serials_tenant_product", "tenant_id", "product_id"),
        Index("uq_inventory_serials_tenant_serial", "tenant_id", "serial_number", unique=True),
        Index("ix_inventory_serials_tenant_status", "tenant_id", "status"),
    )


class WarrantyClaim(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "inventory_warranty_claims"

    claim_number: Mapped[str] = mapped_column(String(50), nullable=False)
    serial_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_product_serials.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted")
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    serial = relationship("ProductSerial", back_populates="warranty_claims", lazy="joined")

    __table_args__ = (
        Index("ix_inventory_warranty_tenant_serial", "tenant_id", "serial_id"),
        Index("uq_inventory_warranty_tenant_number", "tenant_id", "claim_number", unique=True),
        Index("ix_inventory_warranty_tenant_status", "tenant_id", "status"),
    )
