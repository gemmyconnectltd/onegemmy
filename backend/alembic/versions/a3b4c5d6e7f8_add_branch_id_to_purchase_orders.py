"""add branch_id to purchase orders

Revision ID: a3b4c5d6e7f8
Revises: f7a8b9c0d1e2
Create Date: 2026-10-04 15:40:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'a3b4c5d6e7f8'
down_revision: str | None = 'f7a8b9c0d1e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "purchase_orders",
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_purchase_orders_tenant_branch", "purchase_orders", ["tenant_id", "branch_id"])

    # Backfill existing purchase orders to their tenant's main branch, same
    # convention as every other branch-scoped backfill in this feature.
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE purchase_orders po
        SET branch_id = b.id
        FROM branches b
        WHERE b.tenant_id = po.tenant_id AND b.is_main = true AND po.branch_id IS NULL
    """))


def downgrade() -> None:
    op.drop_index("ix_purchase_orders_tenant_branch", table_name="purchase_orders")
    op.drop_column("purchase_orders", "branch_id")
