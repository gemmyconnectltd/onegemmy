"""Super Admin Data Management: operation plans, per-record outcomes, saved filters and platform permissions.

Nobody is granted the new platform permissions by this migration: a platform administrator receives them one by one with
`python -m scripts.grant_data_permissions`.

Revision ID: b3e8f1a6d724
Revises: a1d4e7b2c593
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "b3e8f1a6d724"
down_revision = "a1d4e7b2c593"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _stamps():
    return [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade() -> None:
    op.add_column("users", sa.Column("platform_permissions", postgresql.JSONB(), nullable=True))
    op.create_table(
        "data_operations",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("reference", sa.String(30), nullable=False),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("tenant_name", sa.String(255), nullable=False),
        sa.Column("module", sa.String(30), nullable=False), sa.Column("operation", sa.String(15), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="Prepared"),
        sa.Column("filters", postgresql.JSONB(), nullable=False, server_default="{}"), sa.Column("selection", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("record_ids", postgresql.JSONB(), nullable=False, server_default="[]"), sa.Column("versions", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("analysis", postgresql.JSONB(), nullable=False, server_default="{}"), sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("plan_hash", sa.String(64), nullable=False), sa.Column("reason", sa.Text()),
        sa.Column("approval_required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("requested_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("requested_by_name", sa.String(255)),
        sa.Column("submitted_at", sa.DateTime(timezone=True)), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("decided_by_name", sa.String(255)),
        sa.Column("decided_at", sa.DateTime(timezone=True)), sa.Column("decision_note", sa.String(500)),
        sa.Column("executed_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("executed_by_name", sa.String(255)),
        sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("idempotency_key", sa.String(64)), sa.Column("result", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("affected_count", sa.Integer(), nullable=False, server_default="0"), *_stamps(),
    )
    op.create_index("uq_data_operations_reference", "data_operations", ["reference"], unique=True)
    op.create_index("ix_data_operations_tenant", "data_operations", ["tenant_id", "created_at"])
    op.create_index("ix_data_operations_status", "data_operations", ["status"])
    op.create_table(
        "data_operation_items",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("operation_id", UUID, sa.ForeignKey("data_operations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("record_id", UUID, nullable=False), sa.Column("label", sa.String(255)),
        sa.Column("outcome", sa.String(12), nullable=False), sa.Column("message", sa.Text()), sa.Column("snapshot", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_data_operation_items_operation", "data_operation_items", ["operation_id", "outcome"])
    op.create_table(
        "data_saved_filters",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("admin_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE")),
        sa.Column("module", sa.String(30), nullable=False), sa.Column("name", sa.String(100), nullable=False),
        sa.Column("filters", postgresql.JSONB(), nullable=False, server_default="{}"), *_stamps(),
    )
    op.create_index("ix_data_saved_filters_admin", "data_saved_filters", ["admin_id", "module"])
    # The record of what was done is never deleted and its items are never edited. The operation row itself moves through its statuses.
    op.execute("""
        CREATE OR REPLACE FUNCTION data_management_no_delete() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'Data operation history cannot be deleted'; END; $$ LANGUAGE plpgsql;
    """)
    op.execute("CREATE TRIGGER data_operations_no_delete BEFORE DELETE ON data_operations FOR EACH ROW EXECUTE FUNCTION data_management_no_delete()")
    op.execute("""
        CREATE OR REPLACE FUNCTION data_management_items_append_only() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'Data operation results cannot be edited or deleted'; END; $$ LANGUAGE plpgsql;
    """)
    op.execute("CREATE TRIGGER data_operation_items_append_only BEFORE UPDATE OR DELETE ON data_operation_items FOR EACH ROW EXECUTE FUNCTION data_management_items_append_only()")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS data_operation_items_append_only ON data_operation_items")
    op.execute("DROP TRIGGER IF EXISTS data_operations_no_delete ON data_operations")
    op.execute("DROP FUNCTION IF EXISTS data_management_items_append_only()")
    op.execute("DROP FUNCTION IF EXISTS data_management_no_delete()")
    op.drop_table("data_saved_filters")
    op.drop_table("data_operation_items")
    op.drop_table("data_operations")
    op.drop_column("users", "platform_permissions")
