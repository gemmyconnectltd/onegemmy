import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

MOVEMENT_TYPES = ("opening", "receipt", "sale", "customer_return", "supplier_return", "transfer_out", "transfer_in", "adjustment", "count", "damage", "production")


class Warehouse(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A physical place stock is kept. A business may have several; a branch may have none, one or many. Quantity lives in StockMovement."""
    __tablename__ = "inventory_warehouses"

    code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # Stock whose place is not said (a sale from a till with no warehouse of its own) is taken from, and received into, the default.
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    branch = relationship("Branch", foreign_keys=[branch_id], lazy="joined")
    manager = relationship("User", foreign_keys=[manager_id], lazy="joined")

    __table_args__ = (Index("uq_inventory_warehouses_tenant_code", "tenant_id", "code", unique=True),)


class StockMovement(UUIDPKMixin, TenantScopedMixin, Base):
    """One line of the stock ledger. Rows are only ever added, never edited or deleted: a mistake is corrected by a new movement."""
    __tablename__ = "inventory_stock_movements"

    warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_product_variants.id", ondelete="CASCADE"), nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)  # signed: positive in, negative out
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    warehouse = relationship("Warehouse", lazy="joined")

    __table_args__ = (
        Index("ix_stock_movements_tenant_warehouse_product", "tenant_id", "warehouse_id", "product_id", "variant_id"),
        Index("ix_stock_movements_tenant_created", "tenant_id", "created_at"),
        Index("ix_stock_movements_reference", "reference_type", "reference_id"),
    )


class StockCount(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A physical count of one warehouse. The differences from the book quantity become an adjustment only when it is approved."""
    __tablename__ = "inventory_stock_counts"

    count_number: Mapped[str] = mapped_column(String(50), nullable=False)
    warehouse_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="Submitted")  # Submitted | Approved | Rejected
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    counted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    warehouse = relationship("Warehouse", lazy="joined")
    lines = relationship("StockCountLine", back_populates="count", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (Index("uq_inventory_stock_counts_tenant_number", "tenant_id", "count_number", unique=True),)


class StockCountLine(UUIDPKMixin, Base):
    __tablename__ = "inventory_stock_count_lines"

    count_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_stock_counts.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_product_variants.id", ondelete="CASCADE"), nullable=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    expected_quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    counted_quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)

    count = relationship("StockCount", back_populates="lines")

    __table_args__ = (Index("ix_stock_count_lines_count", "count_id"),)
