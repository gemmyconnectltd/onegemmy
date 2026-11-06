"""Owner data requests are one module each again: the batch grouping column is removed.

Revision ID: f2d7a4c1b963
Revises: e7c2b9f41a05
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "f2d7a4c1b963"
down_revision = "e7c2b9f41a05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_data_management_requests_batch", table_name="data_management_requests")
    op.drop_column("data_management_requests", "batch_id")


def downgrade() -> None:
    op.add_column("data_management_requests", sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_data_management_requests_batch", "data_management_requests", ["batch_id"])
