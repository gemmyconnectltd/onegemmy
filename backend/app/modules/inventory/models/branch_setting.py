"""How one branch sells one product: whether it is sold there and, optionally, its own price.

Only used by businesses with branch pricing switched on (``Tenant.branch_pricing``). A product with no row for a branch is
sold there at its default price, so most businesses never get a row. A row exists only while it differs from that
default (hidden, or its own price); setting a branch back to the default deletes the row.
"""
import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class ProductBranchSetting(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "inventory_product_branch_settings"
    __table_args__ = (
        UniqueConstraint("tenant_id", "product_id", "branch_id", name="uq_product_branch_setting"),
        Index("ix_product_branch_settings_tenant_branch", "tenant_id", "branch_id"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False
    )
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    # None = the product's default price applies in this branch.
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
