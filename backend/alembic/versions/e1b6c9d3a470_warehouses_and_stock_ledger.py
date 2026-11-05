"""Warehouses, the stock movement ledger, stock counts and warehouse-aware transfers.

Nothing changes for a business until it opens Warehouses: the ledger is only written for businesses that have a warehouse, and the
first one is created with an opening movement for every product and variant already in stock, so the ledger starts equal to the books.

Revision ID: e1b6c9d3a470
Revises: d8a2f5c1e694
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "e1b6c9d3a470"
down_revision = "d8a2f5c1e694"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _id():
    return sa.Column("id", UUID, primary_key=True)


def _stamps():
    return [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade() -> None:
    op.create_table(
        "inventory_warehouses", _id(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(30), nullable=False), sa.Column("name", sa.String(150), nullable=False),
        sa.Column("branch_id", UUID, sa.ForeignKey("branches.id", ondelete="SET NULL")),
        sa.Column("manager_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("address", sa.String(500)), sa.Column("description", sa.Text()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"), *_stamps(),
    )
    op.create_index("uq_inventory_warehouses_tenant_code", "inventory_warehouses", ["tenant_id", "code"], unique=True)
    op.create_index("ix_inventory_warehouses_tenant_id", "inventory_warehouses", ["tenant_id"])
    op.create_table(
        "inventory_stock_movements", _id(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("warehouse_id", UUID, sa.ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("product_id", UUID, sa.ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", UUID, sa.ForeignKey("inventory_product_variants.id", ondelete="CASCADE")),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False), sa.Column("movement_type", sa.String(20), nullable=False),
        sa.Column("reference_type", sa.String(30)), sa.Column("reference_id", UUID), sa.Column("reference_number", sa.String(50)),
        sa.Column("note", sa.String(500)), sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_stock_movements_tenant_warehouse_product", "inventory_stock_movements", ["tenant_id", "warehouse_id", "product_id", "variant_id"])
    op.create_index("ix_stock_movements_tenant_created", "inventory_stock_movements", ["tenant_id", "created_at"])
    op.create_index("ix_stock_movements_reference", "inventory_stock_movements", ["reference_type", "reference_id"])
    # The ledger is append-only: a wrong movement is corrected by a new one, never by editing or deleting history.
    op.execute("""
        CREATE OR REPLACE FUNCTION inventory_stock_movements_immutable() RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'DELETE' AND (NOT EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id) OR NOT EXISTS (SELECT 1 FROM inventory_products WHERE id = OLD.product_id)) THEN RETURN OLD; END IF;
            RAISE EXCEPTION 'The stock ledger is append-only: add a correcting movement instead';
        END; $$ LANGUAGE plpgsql;
    """)
    op.execute("CREATE TRIGGER inventory_stock_movements_no_change BEFORE UPDATE OR DELETE ON inventory_stock_movements FOR EACH ROW EXECUTE FUNCTION inventory_stock_movements_immutable()")
    op.create_table(
        "inventory_stock_counts", _id(),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("count_number", sa.String(50), nullable=False),
        sa.Column("warehouse_id", UUID, sa.ForeignKey("inventory_warehouses.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="Submitted"), sa.Column("note", sa.Text()),
        sa.Column("counted_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("decided_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("decided_at", sa.DateTime(timezone=True)), sa.Column("decision_note", sa.Text()), *_stamps(),
    )
    op.create_index("uq_inventory_stock_counts_tenant_number", "inventory_stock_counts", ["tenant_id", "count_number"], unique=True)
    op.create_table(
        "inventory_stock_count_lines", _id(),
        sa.Column("count_id", UUID, sa.ForeignKey("inventory_stock_counts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", UUID, sa.ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", UUID, sa.ForeignKey("inventory_product_variants.id", ondelete="CASCADE")),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("expected_quantity", sa.Numeric(14, 3), nullable=False), sa.Column("counted_quantity", sa.Numeric(14, 3), nullable=False),
    )
    op.create_index("ix_stock_count_lines_count", "inventory_stock_count_lines", ["count_id"])
    op.add_column("inventory_stock_transfers", sa.Column("from_warehouse_id", UUID, sa.ForeignKey("inventory_warehouses.id", ondelete="SET NULL")))
    op.add_column("inventory_stock_transfers", sa.Column("to_warehouse_id", UUID, sa.ForeignKey("inventory_warehouses.id", ondelete="SET NULL")))
    op.add_column("inventory_stock_transfers", sa.Column("dispatched_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("inventory_stock_transfers", "dispatched_at")
    op.drop_column("inventory_stock_transfers", "to_warehouse_id")
    op.drop_column("inventory_stock_transfers", "from_warehouse_id")
    op.drop_table("inventory_stock_count_lines")
    op.drop_table("inventory_stock_counts")
    op.execute("DROP TRIGGER IF EXISTS inventory_stock_movements_no_change ON inventory_stock_movements")
    op.execute("DROP FUNCTION IF EXISTS inventory_stock_movements_immutable()")
    op.drop_table("inventory_stock_movements")
    op.drop_table("inventory_warehouses")
