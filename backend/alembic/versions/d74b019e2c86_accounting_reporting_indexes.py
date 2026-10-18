"""Build accounting reporting indexes without blocking writes to existing tables."""
from alembic import op

revision = "d74b019e2c86"
down_revision = "c61d2a84e907"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_accounting_accounts_tenant_parent ON accounting_accounts (tenant_id, parent_id)")
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_accounting_transactions_tenant_branch_date ON accounting_transactions (tenant_id, branch_id, transaction_date)")
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_accounting_transactions_tenant_posted_date ON accounting_transactions (tenant_id, status, transaction_date)")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name in ["ix_accounting_accounts_tenant_parent", "ix_accounting_transactions_tenant_branch_date", "ix_accounting_transactions_tenant_posted_date"]:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
