"""Branch prices and availability: a per-business switch plus one row per product and branch that differs

Revision ID: 9e2a6c4d1b38
Revises: 8d1f3b6c2e47

Adds tenants.branch_pricing (false for every business) and an empty inventory_product_branch_settings table. Nothing
existing changes: with the switch off, or with no rows, every product sells everywhere at its default price.
Rollback: `alembic downgrade 8d1f3b6c2e47` drops the table (every branch price and hidden-product setting) and the switch.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

from alembic import op

revision: str = "9e2a6c4d1b38"
down_revision: str | None = "8d1f3b6c2e47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("tenants", sa.Column("branch_pricing", sa.Boolean, nullable=False, server_default=sa.false()))
    op.create_table(
        "inventory_product_branch_settings",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("product_id", UUID, sa.ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False,
                  index=True),
        sa.Column("branch_id", UUID, sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_available", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "product_id", "branch_id", name="uq_product_branch_setting"),
    )
    op.create_index("ix_product_branch_settings_tenant_branch", "inventory_product_branch_settings",
                    ["tenant_id", "branch_id"])


def downgrade() -> None:
    op.drop_index("ix_product_branch_settings_tenant_branch", table_name="inventory_product_branch_settings")
    op.drop_table("inventory_product_branch_settings")
    op.drop_column("tenants", "branch_pricing")
