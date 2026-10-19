"""Add optional customer credit policies and explicit business timezone; preserve legacy limits."""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "d94e05f16a27"
down_revision = "c83d94e05f16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("manufacturing_production_items", sa.Column("wastage_quantity", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("manufacturing_production_orders", sa.Column("branch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True))
    op.add_column("sales_order_items", sa.Column("requested_serial_ids", postgresql.JSON(), nullable=True))
    op.add_column("users", sa.Column("branch_ids", postgresql.JSONB(), nullable=True))
    op.add_column("sales_orders", sa.Column("credit_granted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("tenants", sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"))
    op.add_column("sales_customers", sa.Column("credit_daily_limit", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("manufacturing_production_items", "wastage_quantity")
    op.drop_column("manufacturing_production_orders", "branch_id")
    op.drop_column("sales_order_items", "requested_serial_ids")
    op.drop_column("users", "branch_ids")
    op.drop_column("sales_orders", "credit_granted_at")
    op.drop_column("sales_customers", "credit_daily_limit")
    op.drop_column("tenants", "timezone")
