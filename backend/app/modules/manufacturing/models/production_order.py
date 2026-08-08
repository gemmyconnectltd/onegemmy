import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class ProductionOrder(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "manufacturing_production_orders"

    order_number: Mapped[str] = mapped_column(String(50), nullable=False)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="SET NULL"), nullable=True
    )
    product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="Draft")
    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product = relationship("Product", lazy="joined")
    items = relationship(
        "ProductionItem", back_populates="production_order", lazy="selectin", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_manufacturing_orders_tenant_status", "tenant_id", "status"),
        UniqueConstraint("tenant_id", "order_number", name="uq_manufacturing_orders_tenant_number"),
    )
