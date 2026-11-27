"""A branch's own reorder level for one product (or one variant).

Each branch keeps its own stock, so "low" is judged per branch: Kayonza may reorder at 4 while Kigali reorders at 20. A product or
variant with no row for a branch uses its own `min_stock` there. Prices and "sold in this branch" stay on ProductBranchSetting
(branch pricing); this table only holds reorder levels, so there is one place for each fact.
"""
import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Index, Numeric, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class BranchReorderLevel(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "inventory_branch_reorder_levels"
    __table_args__ = (
        # One level per (product, branch) for the product itself and one per (variant, branch); NULL variants need their own index.
        Index("uq_branch_reorder_product", "tenant_id", "product_id", "branch_id", unique=True, postgresql_where=text("variant_id IS NULL")),
        Index("uq_branch_reorder_variant", "tenant_id", "variant_id", "branch_id", unique=True, postgresql_where=text("variant_id IS NOT NULL")),
        Index("ix_branch_reorder_tenant_branch", "tenant_id", "branch_id"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("inventory_product_variants.id", ondelete="CASCADE"), nullable=True)
    branch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    reorder_level: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
