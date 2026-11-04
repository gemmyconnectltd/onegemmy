"""Immutable receipt history; each confirmation is also a stock movement reference."""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class GoodsReceipt(UUIDPKMixin, TenantScopedMixin, Base):
    __tablename__ = "procurement_goods_receipts"
    reference: Mapped[str] = mapped_column(String(50), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    client_reference: Mapped[str] = mapped_column(String(50), nullable=False)
    purchase_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=False
    )
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id"), nullable=True
    )
    received_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    purchase_order = relationship("PurchaseOrder", lazy="raise")
    lines = relationship("GoodsReceiptLine", lazy="selectin", cascade="all, delete-orphan")
    __table_args__ = (
        Index("uq_goods_receipts_tenant_client", "tenant_id", "client_reference", unique=True),
        Index("ix_goods_receipts_tenant_date", "tenant_id", "received_at"),
        Index("ix_goods_receipts_tenant_order", "tenant_id", "purchase_order_id"),
    )


class GoodsReceiptLine(UUIDPKMixin, Base):
    __tablename__ = "procurement_goods_receipt_lines"
    receipt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("procurement_goods_receipts.id"), nullable=False
    )
    purchase_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("purchase_items.id"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    __table_args__ = (
        Index('ix_receipt_lines_item', 'purchase_item_id', 'receipt_id'),Index("ix_receipt_lines_receipt", "receipt_id"),)
