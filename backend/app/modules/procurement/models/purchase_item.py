import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import UUIDPKMixin


class PurchaseItem(UUIDPKMixin, Base):
    __tablename__ = "purchase_items"

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
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    variant_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    unit_cost: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    line_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    purchase_order = relationship("PurchaseOrder", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id], lazy="joined")
    variant = relationship("ProductVariant", foreign_keys=[variant_id], lazy="joined")

    __table_args__ = (
        Index("ix_purchase_items_purchase_order_id", "purchase_order_id"),
        Index("ix_purchase_items_product_id", "product_id"),
        Index("ix_purchase_items_variant_id", "variant_id"),
    )
