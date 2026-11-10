"""Customer lifecycle: archived customers

Revision ID: c4e8a2b6d913
Revises: b3d7f1a9c562

Additive: archived_at/archived_by stay NULL for every existing customer (all remain as they are: active or inactive).
Archiving never deletes or detaches sales, payments, debts or journals. Rollback: `alembic downgrade b3d7f1a9c562`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'c4e8a2b6d913'
down_revision: str | None = 'b3d7f1a9c562'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sales_customers", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sales_customers", sa.Column("archived_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_sales_customers_tenant_status", "sales_customers", ["tenant_id", "is_active", "archived_at"])


def downgrade() -> None:
    op.drop_index("ix_sales_customers_tenant_status", table_name="sales_customers")
    op.drop_column("sales_customers", "archived_by")
    op.drop_column("sales_customers", "archived_at")
