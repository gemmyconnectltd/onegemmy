"""Index purchase history dates without blocking active purchase writes."""
from alembic import op

revision = "c83d94e05f16"
down_revision = "b72c83d94e05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_purchases_tenant_created ON purchase_orders (tenant_id, created_at)")
        op.execute("CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_purchases_tenant_branch_created ON purchase_orders (tenant_id, branch_id, created_at)")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_purchases_tenant_branch_created")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_purchases_tenant_created")
