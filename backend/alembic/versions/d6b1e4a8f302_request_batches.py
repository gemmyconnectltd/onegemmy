"""Owner data-review requests can belong to a batch: one date range asked for across several modules at once.

Each module is still its own request (and its own operation); the batch id only groups them so the platform team can prepare or decline them together.

Revision ID: d6b1e4a8f302
Revises: c4a9d2e7f610
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "d6b1e4a8f302"
down_revision = "c4a9d2e7f610"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("data_management_requests", sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_data_management_requests_batch", "data_management_requests", ["batch_id"])


def downgrade() -> None:
    op.drop_index("ix_data_management_requests_batch", table_name="data_management_requests")
    op.drop_column("data_management_requests", "batch_id")
