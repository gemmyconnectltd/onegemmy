"""tenants.marketing_opt_out

Revision ID: a7c3e91d5b24
Revises: f3b6c8d02a91
"""
import sqlalchemy as sa
from alembic import op

revision = "a7c3e91d5b24"
down_revision = "f3b6c8d02a91"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("marketing_opt_out", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tenants", sa.Column("marketing_opt_out_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "marketing_opt_out_at")
    op.drop_column("tenants", "marketing_opt_out")
