"""add variant to order items

Revision ID: a3f1c2b9d4e5
Revises: 0e52800cbbcc
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a3f1c2b9d4e5"
down_revision: Union[str, Sequence[str], None] = "0e52800cbbcc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sales_order_items",
        sa.Column(
            "variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("inventory_product_variants.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "sales_order_items",
        sa.Column("variant_attributes", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )
    op.create_index("ix_sales_order_items_variant_id", "sales_order_items", ["variant_id"])


def downgrade() -> None:
    op.drop_index("ix_sales_order_items_variant_id", table_name="sales_order_items")
    op.drop_column("sales_order_items", "variant_attributes")
    op.drop_column("sales_order_items", "variant_id")
