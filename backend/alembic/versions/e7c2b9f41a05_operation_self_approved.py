"""Data operations record when the requester approved their own operation.

Revision ID: e7c2b9f41a05
Revises: d6b1e4a8f302
"""
import sqlalchemy as sa

from alembic import op

revision = "e7c2b9f41a05"
down_revision = "d6b1e4a8f302"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("data_operations", sa.Column("self_approved", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("data_operations", "self_approved")
