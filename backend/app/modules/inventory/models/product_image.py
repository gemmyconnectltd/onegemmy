import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

MAX_GALLERY_IMAGES = 8


class ProductImage(UUIDPKMixin, TenantScopedMixin, Base):
    """An extra picture of a product. The main picture stays on the product itself (Product.image_url), so every existing screen keeps working."""
    __tablename__ = "inventory_product_images"

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Fingerprint of the picture's bytes, so importing the same spreadsheet twice does not add the same picture twice.
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_inventory_product_images_product", "product_id", "position"),)
