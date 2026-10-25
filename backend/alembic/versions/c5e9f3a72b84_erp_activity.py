"""erp_activity table (page views inside the signed-in app)

Revision ID: c5e9f3a72b84
Revises: b4d8e2f61a73
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "c5e9f3a72b84"
down_revision = "b4d8e2f61a73"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "erp_activity",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("module", sa.String(30), nullable=False),
        sa.Column("surface", sa.String(10), nullable=False),
        sa.Column("path", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_erp_activity_created", "erp_activity", ["created_at"])
    op.create_index("ix_erp_activity_tenant_created", "erp_activity", ["tenant_id", "created_at"])
    op.create_index("ix_erp_activity_user_created", "erp_activity", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_erp_activity_user_created", table_name="erp_activity")
    op.drop_index("ix_erp_activity_tenant_created", table_name="erp_activity")
    op.drop_index("ix_erp_activity_created", table_name="erp_activity")
    op.drop_table("erp_activity")
