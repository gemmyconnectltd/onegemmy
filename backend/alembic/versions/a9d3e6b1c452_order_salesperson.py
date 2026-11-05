"""Salesperson on sales: who is credited with the sale, apart from who keyed it in.

Existing sales are credited to the user who entered them, which is what every report implicitly assumed until now.

Revision ID: a9d3e6b1c452
Revises: e5c3a9d1b742
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "a9d3e6b1c452"
down_revision = "e5c3a9d1b742"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_orders", sa.Column("salesperson_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_sales_orders_salesperson", "sales_orders", "users", ["salesperson_id"], ["id"], ondelete="SET NULL")
    op.execute("UPDATE sales_orders SET salesperson_id = created_by WHERE salesperson_id IS NULL")
    op.create_index("ix_orders_tenant_salesperson_ordered", "sales_orders", ["tenant_id", "salesperson_id", "ordered_at"])


def downgrade() -> None:
    op.drop_index("ix_orders_tenant_salesperson_ordered", table_name="sales_orders")
    op.drop_constraint("fk_sales_orders_salesperson", "sales_orders", type_="foreignkey")
    op.drop_column("sales_orders", "salesperson_id")
