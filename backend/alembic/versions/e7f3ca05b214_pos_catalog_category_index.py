"""Index tenant/category catalogue pagination without blocking product writes.

Revision ID: e7f3ca05b214
Revises: d6e2b9f4a103
"""

from alembic import op

revision = "e7f3ca05b214"
down_revision = "d6e2b9f4a103"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_inventory_products_tenant_category_name",
            "inventory_products",
            ["tenant_id", "category_id", "name", "id"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_inventory_products_tenant_category_name",
            table_name="inventory_products",
            postgresql_concurrently=True,
            if_exists=True,
        )
