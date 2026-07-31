import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import UUIDPKMixin


class ReturnItem(UUIDPKMixin, Base):
    __tablename__ = "sales_return_items"

    return_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_returns.id", ondelete="CASCADE"), nullable=False
    )
    order_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_order_items.id", ondelete="SET NULL"), nullable=True
    )
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="SET NULL"), nullable=True
    )
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    refund_per_unit: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    line_refund: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    return_ = relationship("Return", back_populates="items")
    order_item = relationship("OrderItem", back_populates="return_items", lazy="joined")
    product = relationship("Product", foreign_keys=[product_id], lazy="joined")

    __table_args__ = (
        Index("ix_sales_return_items_return_id", "return_id"),
    )
