import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

QUOTATION_STATUSES = ("Draft", "Sent", "Accepted", "Rejected", "Expired")


class Quotation(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """An offer to a customer. It is not a sale: it takes no payment, posts nothing and holds no stock until it is converted into an order."""
    __tablename__ = "sales_quotations"

    quote_number: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="Draft")
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"), nullable=True)
    salesperson_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    converted_order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_orders.id", ondelete="SET NULL"), nullable=True)

    customer = relationship("Customer", lazy="joined")
    salesperson = relationship("User", foreign_keys=[salesperson_id], lazy="joined")
    items = relationship("QuotationItem", back_populates="quotation", lazy="selectin", cascade="all, delete-orphan", order_by="QuotationItem.position")

    __table_args__ = (
        Index("uq_sales_quotations_tenant_number", "tenant_id", "quote_number", unique=True),
        Index("uq_sales_quotations_converted_order", "converted_order_id", unique=True),
        Index("ix_sales_quotations_tenant_status", "tenant_id", "status"),
        Index("ix_sales_quotations_tenant_salesperson", "tenant_id", "salesperson_id"),
    )


class QuotationItem(UUIDPKMixin, Base):
    __tablename__ = "sales_quotation_items"

    quotation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(default=0)
    product_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="SET NULL"), nullable=True)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_product_variants.id", ondelete="SET NULL"), nullable=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[str | None] = mapped_column(String(100), nullable=True)
    variant_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(12, 3), nullable=False, default=1)
    discount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    line_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    # Tax snapshot, frozen when the line is priced. NULL on documents created before line-level VAT existed.
    tax_treatment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tax_code: Mapped[str | None] = mapped_column(String(30), nullable=True)
    tax_rate: Mapped[Decimal | None] = mapped_column(Numeric(7, 4), nullable=True)
    taxable_base: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    tax_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    quotation = relationship("Quotation", back_populates="items")

    __table_args__ = (Index("ix_sales_quotation_items_quotation", "quotation_id"),)
