"""Customer messaging: tags, birthday and consent on customers, plus messages, templates, segments, broadcasts and automations

Revision ID: 8d1f3b6c2e47
Revises: 7c4e2a9b1d05

Adds columns with safe defaults (tags = [], contact_consent = {}, birthday NULL) and new empty tables; nothing existing changes.
Rollback: `alembic downgrade 7c4e2a9b1d05` drops the new tables and columns (and every message, template and consent record in them).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "8d1f3b6c2e47"
down_revision: str | None = "7c4e2a9b1d05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)


def _base() -> list[sa.Column]:
    return [sa.Column("id", UUID, primary_key=True), sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)]


def _stamps() -> list[sa.Column]:
    return [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade() -> None:
    op.add_column("sales_customers", sa.Column("tags", pg.JSONB, nullable=False, server_default="[]"))
    op.add_column("sales_customers", sa.Column("birthday", sa.Date, nullable=True))
    op.add_column("sales_customers", sa.Column("contact_consent", pg.JSONB, nullable=False, server_default="{}"))
    op.create_index("ix_sales_customers_tags", "sales_customers", ["tags"], postgresql_using="gin")

    op.create_table("messaging_consents", *_base(),
                    sa.Column("customer_id", UUID, sa.ForeignKey("sales_customers.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("channel", sa.String(10), nullable=False), sa.Column("status", sa.String(10), nullable=False),
                    sa.Column("source", sa.String(30), nullable=False), sa.Column("note", sa.String(255)),
                    sa.Column("recorded_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
                    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_messaging_consents_customer", "messaging_consents", ["tenant_id", "customer_id", "created_at"])

    op.create_table("messaging_templates", *_base(), sa.Column("name", sa.String(120), nullable=False),
                    sa.Column("channel", sa.String(10), nullable=False, server_default="any"), sa.Column("purpose", sa.String(10), nullable=False, server_default="marketing"),
                    sa.Column("subject", sa.String(200)), sa.Column("body", sa.Text, nullable=False),
                    sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")), *_stamps())
    op.execute("CREATE UNIQUE INDEX uq_messaging_templates_name ON messaging_templates (tenant_id, lower(name))")

    op.create_table("messaging_segments", *_base(), sa.Column("name", sa.String(120), nullable=False),
                    sa.Column("rules", pg.JSONB, nullable=False, server_default="{}"),
                    sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")), *_stamps())
    op.execute("CREATE UNIQUE INDEX uq_messaging_segments_name ON messaging_segments (tenant_id, lower(name))")

    op.create_table("messaging_broadcasts", *_base(), sa.Column("name", sa.String(150), nullable=False),
                    sa.Column("channel", sa.String(10), nullable=False), sa.Column("purpose", sa.String(10), nullable=False),
                    sa.Column("subject", sa.String(200)), sa.Column("body", sa.Text, nullable=False),
                    sa.Column("audience", pg.JSONB, nullable=False, server_default="{}"), sa.Column("recipients", sa.Integer, nullable=False, server_default="0"),
                    sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
                    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_messaging_broadcasts_tenant", "messaging_broadcasts", ["tenant_id", "created_at"])

    op.create_table("messaging_messages", *_base(),
                    sa.Column("customer_id", UUID, sa.ForeignKey("sales_customers.id", ondelete="SET NULL")),
                    sa.Column("channel", sa.String(10), nullable=False), sa.Column("purpose", sa.String(10), nullable=False),
                    sa.Column("to_address", sa.String(255)), sa.Column("subject", sa.String(200)), sa.Column("body", sa.Text, nullable=False),
                    sa.Column("status", sa.String(10), nullable=False, server_default="queued"), sa.Column("error", sa.String(500)),
                    sa.Column("provider_ref", sa.String(200)),
                    sa.Column("broadcast_id", UUID, sa.ForeignKey("messaging_broadcasts.id", ondelete="SET NULL")),
                    sa.Column("automation", sa.String(20)), sa.Column("reference_id", UUID),
                    sa.Column("sent_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
                    sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
                    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
                    sa.Column("sent_at", sa.DateTime(timezone=True)))
    op.create_index("ix_messaging_messages_tenant", "messaging_messages", ["tenant_id", "created_at"])
    op.create_index("ix_messaging_messages_customer", "messaging_messages", ["tenant_id", "customer_id", "created_at"])
    op.create_index("ix_messaging_messages_queued", "messaging_messages", ["status", "created_at"], postgresql_where=sa.text("status = 'queued'"))
    op.create_index("ix_messaging_messages_automation", "messaging_messages", ["tenant_id", "automation", "customer_id", "created_at"])

    op.create_table("messaging_automations", *_base(), sa.Column("kind", sa.String(20), nullable=False),
                    sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.false()), sa.Column("channel", sa.String(10), nullable=False, server_default="sms"),
                    sa.Column("subject", sa.String(200)), sa.Column("body", sa.Text, nullable=False),
                    sa.Column("config", pg.JSONB, nullable=False, server_default="{}"), sa.Column("last_run_at", sa.DateTime(timezone=True)), *_stamps())
    op.create_index("uq_messaging_automations_kind", "messaging_automations", ["tenant_id", "kind"], unique=True)


def downgrade() -> None:
    for table in ("messaging_automations", "messaging_messages", "messaging_broadcasts", "messaging_segments", "messaging_templates", "messaging_consents"):
        op.drop_table(table)
    op.drop_index("ix_sales_customers_tags", table_name="sales_customers")
    for column in ("contact_consent", "birthday", "tags"):
        op.drop_column("sales_customers", column)
