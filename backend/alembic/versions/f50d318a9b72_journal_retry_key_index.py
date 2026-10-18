"""Index optional journal retry keys without blocking posted ledger writes."""
from alembic import op

revision = "f50d318a9b72"
down_revision = "e49c207f8a61"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_accounting_transactions_tenant_client_ref ON accounting_transactions (tenant_id, client_reference)")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS uq_accounting_transactions_tenant_client_ref")
