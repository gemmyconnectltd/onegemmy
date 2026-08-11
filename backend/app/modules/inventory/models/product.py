import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Product(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "inventory_products"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100))
    barcode: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(500))
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    stock: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    min_stock: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    has_variants: Mapped[bool] = mapped_column(Boolean, default=False)
    tracks_serials: Mapped[bool] = mapped_column(Boolean, default=False)
    sale_by_weight: Mapped[bool] = mapped_column(Boolean, default=False)
    conversion_factor: Mapped[float] = mapped_column(Numeric(14, 3), default=1)
    promo_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    promo_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    category_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_categories.id", ondelete="SET NULL"), nullable=True
    )
    brand_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_brands.id", ondelete="SET NULL"), nullable=True
    )
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_units.id", ondelete="SET NULL"), nullable=True
    )
    sale_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_units.id", ondelete="SET NULL"), nullable=True
    )
    purchase_unit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_units.id", ondelete="SET NULL"), nullable=True
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_suppliers.id", ondelete="SET NULL"), nullable=True
    )

    category = relationship("Category", back_populates="products", lazy="joined")
    brand = relationship("Brand", back_populates="products", lazy="joined")
    unit = relationship("Unit", foreign_keys=[unit_id], back_populates="products", lazy="joined")
    sale_unit = relationship("Unit", foreign_keys=[sale_unit_id], lazy="joined")
    purchase_unit = relationship("Unit", foreign_keys=[purchase_unit_id], lazy="joined")
    supplier = relationship("Supplier", back_populates="products", lazy="joined")
    variants = relationship("ProductVariant", back_populates="product", lazy="selectin", cascade="all, delete-orphan")
    serials = relationship("ProductSerial", back_populates="product", lazy="selectin", cascade="all, delete-orphan")
