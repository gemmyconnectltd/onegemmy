"""Store explicit catalog price instructions on purchase lines until receipt."""
import sqlalchemy as sa

from alembic import op

revision = "b72c83d94e05"
down_revision = "a61b72c83d94"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("purchase_items", sa.Column("update_catalog_cost", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("purchase_items", sa.Column("selling_price", sa.Numeric(12, 2)))


def downgrade() -> None:
    op.drop_column("purchase_items", "selling_price")
    op.drop_column("purchase_items", "update_catalog_cost")
