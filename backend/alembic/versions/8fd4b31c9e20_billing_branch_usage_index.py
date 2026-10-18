"""Concurrent tenant/branch-status lookup index for billing usage.

Revision ID: 8fd4b31c9e20
Revises: 5bcaa29f3a12
"""

from alembic import op

revision = "8fd4b31c9e20"
down_revision = "5bcaa29f3a12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.create_index(
            "ix_branches_tenant_status",
            "branches",
            ["tenant_id", "status"],
            postgresql_concurrently=True,
            if_not_exists=True,
        )


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.drop_index(
            "ix_branches_tenant_status",
            table_name="branches",
            postgresql_concurrently=True,
            if_exists=True,
        )
