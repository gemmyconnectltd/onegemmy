"""Allow business owners to request date-bounded data removal reviews.

Revision ID: c4a9d2e7f610
Revises: b3e8f1a6d724
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "c4a9d2e7f610"
down_revision = "b3e8f1a6d724"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_management_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("module", sa.String(30), nullable=False),
        sa.Column("filters", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="Submitted"),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("requested_by_name", sa.String(255)),
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("data_operations.id", ondelete="SET NULL")),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("review_note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_data_management_requests_tenant_created", "data_management_requests", ["tenant_id", "created_at"])
    op.create_index("ix_data_management_requests_status_created", "data_management_requests", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_data_management_requests_status_created", table_name="data_management_requests")
    op.drop_index("ix_data_management_requests_tenant_created", table_name="data_management_requests")
    op.drop_table("data_management_requests")
