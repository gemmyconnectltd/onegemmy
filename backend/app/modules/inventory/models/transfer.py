import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

TRANSFER_STATUSES = ["pending", "in_transit", "completed", "cancelled"]


class StockTransfer(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "inventory_stock_transfers"

    transfer_number: Mapped[str] = mapped_column(String(50), nullable=False)
    from_branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True
    )
    to_branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    from_branch = relationship("Branch", foreign_keys=[from_branch_id], lazy="joined")
    to_branch = relationship("Branch", foreign_keys=[to_branch_id], lazy="joined")
    items = relationship("StockTransferItem", back_populates="transfer", lazy="selectin",
                         cascade="all, delete-orphan")

    __table_args__ = (
        Index("uq_inventory_transfers_tenant_number", "tenant_id", "transfer_number", unique=True),
        Index("ix_inventory_transfers_tenant_status", "tenant_id", "status"),
    )


class StockTransferItem(UUIDPKMixin, Base):
    __tablename__ = "inventory_stock_transfer_items"

    transfer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_stock_transfers.id", ondelete="CASCADE"), nullable=False
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
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)

    transfer = relationship("StockTransfer", back_populates="items")

    __table_args__ = (
        Index("ix_inventory_transfer_items_transfer_id", "transfer_id"),
    )
