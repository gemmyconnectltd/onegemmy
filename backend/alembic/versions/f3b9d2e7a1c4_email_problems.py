"""Email problems: emails that were refused or bounced, for platform admins to follow up

Revision ID: f3b9d2e7a1c4
Revises: e5a2c7d9b4f1

New table email_problems. Nothing existing changes. Rollback drops the table (the list of problems is lost; nothing else).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f3b9d2e7a1c4"
down_revision: str | None = "e5a2c7d9b4f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_problems",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("recipient", sa.String(255), nullable=False),
        sa.Column("subject", sa.String(300)),
        sa.Column("kind", sa.String(40)),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("reason", sa.String(40), nullable=False),
        sa.Column("detail", sa.Text()),
        sa.Column("smtp_code", sa.String(20)),
        sa.Column("source_ref", sa.String(300), unique=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="SET NULL")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="open"),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("resolution", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_email_problems_status_occurred", "email_problems", ["status", "occurred_at"])
    op.create_index("ix_email_problems_recipient", "email_problems", ["recipient"])


def downgrade() -> None:
    op.drop_index("ix_email_problems_recipient", table_name="email_problems")
    op.drop_index("ix_email_problems_status_occurred", table_name="email_problems")
    op.drop_table("email_problems")
