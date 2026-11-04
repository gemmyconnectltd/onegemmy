"""archive sales

Lets a sale be archived (hidden from the default Sales History) instead of deleted. Nothing is removed and the ledger is untouched.

Revision ID: a4e8c1d7f093
Revises: f1c4d8a2b630
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'a4e8c1d7f093'
down_revision: str | None = 'f1c4d8a2b630'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('sales_orders', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('sales_orders', sa.Column('archived_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('sales_orders', sa.Column('archive_reason', sa.Text(), nullable=True))
    op.create_index('ix_sales_orders_tenant_archived', 'sales_orders', ['tenant_id', 'archived_at'])


def downgrade() -> None:
    op.drop_index('ix_sales_orders_tenant_archived', table_name='sales_orders')
    op.drop_column('sales_orders', 'archive_reason')
    op.drop_column('sales_orders', 'archived_by')
    op.drop_column('sales_orders', 'archived_at')
