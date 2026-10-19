"""Add business report lookup indexes without blocking active writes."""
from alembic import op

revision = "e05f16a27b38"
down_revision = "d94e05f16a27"
branch_labels = None
depends_on = None

INDEXES = {
    "ix_orders_tenant_customer_credit": "sales_orders (tenant_id, customer_id, credit_granted_at)",
    "ix_orders_tenant_branch_ordered": "sales_orders (tenant_id, branch_id, ordered_at)",
    "ix_production_tenant_branch_completed": "manufacturing_production_orders (tenant_id, branch_id, completed_at)",
    "ix_purchases_tenant_branch_received": "purchase_orders (tenant_id, branch_id, received_at)",
}


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for name, target in INDEXES.items():
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {target}")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name in INDEXES:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
