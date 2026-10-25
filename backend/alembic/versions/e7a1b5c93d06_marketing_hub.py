"""marketing hub: contacts, segments, templates, campaigns, automations, sends, events, settings

Revision ID: e7a1b5c93d06
Revises: d6f0a4b83c95
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "e7a1b5c93d06"
down_revision = "d6f0a4b83c95"
branch_labels = None
depends_on = None

UUID = pg.UUID(as_uuid=True)
NOW = sa.func.now()


def _ts(name: str, nullable: bool = True, default: bool = False) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable, server_default=NOW if default else None)


def _base() -> list[sa.Column]:
    return [sa.Column("id", UUID, primary_key=True), _ts("created_at", False, True), _ts("updated_at", False, True)]


def upgrade() -> None:
    op.create_table(
        "marketing_contacts", *_base(),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(255)), sa.Column("business_name", sa.String(255)),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), unique=True),
        sa.Column("phone", sa.String(50)), sa.Column("country", sa.String(100)),
        sa.Column("source", sa.String(20), nullable=False, server_default="tenant"),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("status_reason", sa.String(200)), _ts("status_at"),
        sa.Column("consent", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("consent_source", sa.String(100)), _ts("consent_at"),
        sa.Column("newsletter_subscribed", sa.Boolean, nullable=False, server_default=sa.false()), _ts("newsletter_at"),
        sa.Column("tags", pg.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("email_valid", sa.Boolean, nullable=False, server_default=sa.true()), sa.Column("invalid_reason", sa.String(100)),
    )
    op.create_index("ix_marketing_contacts_status", "marketing_contacts", ["status"])
    op.create_table(
        "marketing_segments", *_base(),
        sa.Column("name", sa.String(120), nullable=False, unique=True), sa.Column("description", sa.String(300)),
        sa.Column("filters", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_table(
        "marketing_templates", *_base(),
        sa.Column("name", sa.String(160), nullable=False), sa.Column("category", sa.String(30), nullable=False),
        sa.Column("description", sa.String(300)), sa.Column("subject", sa.String(300)), sa.Column("preheader", sa.String(200)),
        sa.Column("blocks", pg.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_table(
        "marketing_campaigns", *_base(),
        sa.Column("kind", sa.String(12), nullable=False, server_default="campaign"),
        sa.Column("parent_id", UUID, sa.ForeignKey("marketing_campaigns.id", ondelete="CASCADE")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("campaign_type", sa.String(30), nullable=False, server_default="promotional"),
        sa.Column("subject", sa.String(300), nullable=False, server_default=""), sa.Column("preheader", sa.String(200)),
        sa.Column("sender_name", sa.String(120)), sa.Column("sender_email", sa.String(255)), sa.Column("reply_to", sa.String(255)),
        sa.Column("template_id", UUID, sa.ForeignKey("marketing_templates.id", ondelete="SET NULL")),
        sa.Column("blocks", pg.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("audience", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(12), nullable=False, server_default="draft"),
        _ts("scheduled_at"), _ts("started_at"), _ts("completed_at"),
        sa.Column("recipient_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("schedule", pg.JSONB),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_index("ix_marketing_campaigns_status_sched", "marketing_campaigns", ["status", "scheduled_at"])
    op.create_index("ix_marketing_campaigns_kind", "marketing_campaigns", ["kind", "created_at"])
    op.create_table(
        "marketing_automations", *_base(),
        sa.Column("name", sa.String(160), nullable=False), sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("trigger", sa.String(30), nullable=False), sa.Column("delay_hours", sa.Integer, nullable=False, server_default="0"),
        sa.Column("params", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("template_id", UUID, sa.ForeignKey("marketing_templates.id", ondelete="SET NULL")),
        sa.Column("subject", sa.String(300), nullable=False, server_default=""), sa.Column("preheader", sa.String(200)),
        sa.Column("blocks", pg.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.false()), _ts("activated_at"), _ts("last_run_at"),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_table(
        "marketing_sends",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("campaign_id", UUID, sa.ForeignKey("marketing_campaigns.id", ondelete="CASCADE")),
        sa.Column("automation_id", UUID, sa.ForeignKey("marketing_automations.id", ondelete="CASCADE")),
        sa.Column("contact_id", UUID, sa.ForeignKey("marketing_contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("dedupe_key", sa.String(40), nullable=False, server_default=""),  # lets a recurring trigger (renewals) send once per cycle
        sa.Column("status", sa.String(12), nullable=False, server_default="pending"),
        sa.Column("reason", sa.String(300)), sa.Column("message_id", sa.String(255)),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        _ts("next_attempt_at"), _ts("send_started_at"), _ts("queued_at", False, True), _ts("sent_at"),
        sa.Column("opens", sa.Integer, nullable=False, server_default="0"), sa.Column("clicks", sa.Integer, nullable=False, server_default="0"),
        _ts("first_open_at"), _ts("first_click_at"), _ts("unsubscribed_at"),
    )
    op.create_index("uq_marketing_sends_campaign_contact", "marketing_sends", ["campaign_id", "contact_id"], unique=True, postgresql_where=sa.text("campaign_id IS NOT NULL"))
    op.create_index("uq_marketing_sends_automation_contact", "marketing_sends", ["automation_id", "contact_id", "dedupe_key"], unique=True, postgresql_where=sa.text("automation_id IS NOT NULL"))
    op.create_index("ix_marketing_sends_due", "marketing_sends", ["status", "next_attempt_at"])
    op.create_index("ix_marketing_sends_campaign_status", "marketing_sends", ["campaign_id", "status"])
    op.create_index("ix_marketing_sends_contact", "marketing_sends", ["contact_id", "queued_at"])
    op.create_table(
        "marketing_events",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("send_id", UUID, sa.ForeignKey("marketing_sends.id", ondelete="CASCADE"), nullable=False),
        sa.Column("campaign_id", UUID), sa.Column("automation_id", UUID),
        sa.Column("kind", sa.String(12), nullable=False), sa.Column("url", sa.String(500)), _ts("created_at", False, True),
    )
    op.create_index("ix_marketing_events_created", "marketing_events", ["created_at"])
    op.create_index("ix_marketing_events_campaign", "marketing_events", ["campaign_id", "kind"])
    op.create_table(
        "marketing_settings",
        sa.Column("key", sa.String(50), primary_key=True), sa.Column("value", pg.JSONB, nullable=False), _ts("updated_at", False, True),
    )


def downgrade() -> None:
    for table in ("marketing_settings", "marketing_events", "marketing_sends", "marketing_automations", "marketing_campaigns",
                  "marketing_templates", "marketing_segments", "marketing_contacts"):
        op.drop_table(table)
