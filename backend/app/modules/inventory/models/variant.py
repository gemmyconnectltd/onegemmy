import uuid

from sqlalchemy import Boolean, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class ProductVariant(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "inventory_product_variants"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False
    )
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    attributes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    min_stock: Mapped[int] = mapped_column(Integer, default=0)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    product = relationship("Product", back_populates="variants")

    __table_args__ = (
        Index("ix_inventory_variants_product_id", "product_id"),
        Index("uq_inventory_variants_product_sku", "product_id", "sku", unique=True,
              postgresql_where="sku IS NOT NULL"),
    )
