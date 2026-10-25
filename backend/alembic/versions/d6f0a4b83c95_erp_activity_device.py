"""erp_activity device / os / browser

Revision ID: d6f0a4b83c95
Revises: c5e9f3a72b84
"""
import sqlalchemy as sa
from alembic import op

revision = "d6f0a4b83c95"
down_revision = "c5e9f3a72b84"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("erp_activity", sa.Column("device", sa.String(10), nullable=True))
    op.add_column("erp_activity", sa.Column("os", sa.String(20), nullable=True))
    op.add_column("erp_activity", sa.Column("browser", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("erp_activity", "browser")
    op.drop_column("erp_activity", "os")
    op.drop_column("erp_activity", "device")
