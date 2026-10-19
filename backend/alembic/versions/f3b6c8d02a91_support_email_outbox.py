"""support email outbox: idempotent sends, retry state, pending conversation status

Revision ID: f3b6c8d02a91
Revises: e05f16a27b38
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f3b6c8d02a91"
down_revision = "e05f16a27b38"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("support_messages", sa.Column("client_request_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("support_messages", sa.Column("send_attempts", sa.Integer(), nullable=True, server_default="0"))
    op.add_column("support_messages", sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("support_messages", sa.Column("send_started_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("uq_support_msg_client_request", "support_messages", ["conversation_id", "sender_user_id", "client_request_id"],
                    unique=True, postgresql_where=sa.text("client_request_id IS NOT NULL"))
    op.create_index("ix_support_email_outbox", "support_messages", ["delivery_status", "next_attempt_at"],
                    postgresql_where=sa.text("provider = 'email' AND direction = 'outgoing'"))


def downgrade() -> None:
    op.drop_index("ix_support_email_outbox", table_name="support_messages")
    op.drop_index("uq_support_msg_client_request", table_name="support_messages")
    for col in ("send_started_at", "next_attempt_at", "send_attempts", "client_request_id"):
        op.drop_column("support_messages", col)
