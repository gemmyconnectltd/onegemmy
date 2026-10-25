"""website_visits table and tenants.attribution_visitor_id

Revision ID: b4d8e2f61a73
Revises: a7c3e91d5b24
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b4d8e2f61a73"
down_revision = "a7c3e91d5b24"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "website_visits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("visitor_id", sa.String(64), nullable=False),
        sa.Column("path", sa.String(200), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("referrer_host", sa.String(120)),
        sa.Column("utm_source", sa.String(100)),
        sa.Column("utm_medium", sa.String(100)),
        sa.Column("utm_campaign", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_website_visits_created", "website_visits", ["created_at"])
    op.create_index("ix_website_visits_visitor_created", "website_visits", ["visitor_id", "created_at"])
    op.add_column("tenants", sa.Column("attribution_visitor_id", sa.String(64), nullable=True))
    op.create_index("ix_tenants_attribution_visitor_id", "tenants", ["attribution_visitor_id"])


def downgrade() -> None:
    op.drop_index("ix_tenants_attribution_visitor_id", table_name="tenants")
    op.drop_column("tenants", "attribution_visitor_id")
    op.drop_index("ix_website_visits_visitor_created", table_name="website_visits")
    op.drop_index("ix_website_visits_created", table_name="website_visits")
    op.drop_table("website_visits")
