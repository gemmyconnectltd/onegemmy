"""Why a sale is waiting for approval: the customer's credit limit, or the business policy of approving every sale first.

Sales already held when this runs were held for credit, the only reason there was.

Revision ID: b2f7c4d9a815
Revises: a9d3e6b1c452
"""
import sqlalchemy as sa

from alembic import op

revision = "b2f7c4d9a815"
down_revision = "a9d3e6b1c452"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_orders", sa.Column("held_reason", sa.String(10), nullable=True))
    op.execute("UPDATE sales_orders SET held_reason = 'credit' WHERE status = 'Awaiting Approval'")


def downgrade() -> None:
    op.drop_column("sales_orders", "held_reason")
