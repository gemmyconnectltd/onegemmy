import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class BillOfMaterial(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A reusable recipe: the components a finished product is built from.

    Distinct from a `ProductionOrder`'s own `items`, which are a one-off
    snapshot for that specific work order and don't feed back into this.
    """

    __tablename__ = "manufacturing_boms"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="SET NULL"), nullable=True
    )
    product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    product = relationship("Product", lazy="joined")
    items = relationship(
        "BillOfMaterialItem", back_populates="bom", lazy="selectin", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_manufacturing_boms_tenant_product", "tenant_id", "product_id"),
        UniqueConstraint("tenant_id", "product_id", "name", name="uq_manufacturing_boms_tenant_product_name"),
    )


class BillOfMaterialItem(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "manufacturing_bom_items"

    bom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manufacturing_boms.id", ondelete="CASCADE"), nullable=False
    )
    component_product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="SET NULL"), nullable=True
    )
    component_product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity_required: Mapped[int] = mapped_column(Integer, default=1)

    component_product = relationship("Product", lazy="joined")
    bom = relationship("BillOfMaterial", back_populates="items")

    __table_args__ = (
        Index("ix_manufacturing_bom_items_bom_id", "bom_id"),
        Index("ix_manufacturing_bom_items_component_id", "component_product_id"),
    )
