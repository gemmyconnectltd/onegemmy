"""Indexes for tenant product history and source-line lookups.

Concurrent creation avoids locking hot transaction tables.
"""

from alembic import op

revision = "d9b7e302a164"
down_revision = "c8f3a1d5e902"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_audit_product_history",
            "audit_logs",
            ["tenant_id", "entity_type", "entity_id", "created_at"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )
        op.create_index(
            "ix_transfer_items_product",
            "inventory_stock_transfer_items",
            ["product_id", "transfer_id"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )
        op.create_index(
            "ix_receipt_lines_item",
            "procurement_goods_receipt_lines",
            ["purchase_item_id", "receipt_id"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )
        op.create_index(
            "ix_return_items_product",
            "sales_return_items",
            ["product_id", "return_id"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_return_items_product",
            table_name="sales_return_items",
            postgresql_concurrently=True,
            if_exists=True,
        )
        op.drop_index(
            "ix_receipt_lines_item",
            table_name="procurement_goods_receipt_lines",
            postgresql_concurrently=True,
            if_exists=True,
        )
        op.drop_index(
            "ix_transfer_items_product",
            table_name="inventory_stock_transfer_items",
            postgresql_concurrently=True,
            if_exists=True,
        )
        op.drop_index(
            "ix_audit_product_history",
            table_name="audit_logs",
            postgresql_concurrently=True,
            if_exists=True,
        )
