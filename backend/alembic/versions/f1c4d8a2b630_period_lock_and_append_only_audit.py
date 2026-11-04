"""accounting period lock and append-only audit log

Adds the date through which the books are closed, and a trigger that stops audit rows being edited
(clearing the actor when a user is deleted is still allowed). No financial data is changed.

Revision ID: f1c4d8a2b630
Revises: e3a7b1c9d204
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'f1c4d8a2b630'
down_revision: str | None = 'e3a7b1c9d204'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('accounting_preferences', sa.Column('locked_through', sa.Date(), nullable=True))
    op.execute("""
    CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger AS $$
    BEGIN
      IF (NEW.id, NEW.tenant_id, NEW.actor_name, NEW.action, NEW.entity_type, NEW.entity_id, NEW.summary, NEW.changes, NEW.ip_address, NEW.created_at)
         IS DISTINCT FROM
         (OLD.id, OLD.tenant_id, OLD.actor_name, OLD.action, OLD.entity_type, OLD.entity_id, OLD.summary, OLD.changes, OLD.ip_address, OLD.created_at) THEN
        RAISE EXCEPTION 'audit_logs rows are append-only';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """)
    op.execute("CREATE TRIGGER audit_logs_no_edit BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only()")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_logs_no_edit ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS audit_logs_append_only()")
    op.drop_column('accounting_preferences', 'locked_through')
