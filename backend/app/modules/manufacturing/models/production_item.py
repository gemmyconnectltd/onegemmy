import uuid

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class ProductionItem(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "manufacturing_production_items"

    production_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manufacturing_production_orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="SET NULL"), nullable=True
    )
    product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity_required: Mapped[int] = mapped_column(Integer, default=1)

    product = relationship("Product", lazy="joined")
    production_order = relationship("ProductionOrder", back_populates="items")

    __table_args__ = (
        Index("ix_manufacturing_items_order_id", "production_order_id"),
        Index("ix_manufacturing_items_product_id", "product_id"),
    )
