"""add admin analytics indexes

Revision ID: a1c4e7d93b52
Revises: 9f773bd126d4
Create Date: 2026-10-07 10:00:00.000000

Indexes backing the super-admin Platform Overview analytics (period range
scans on orders/users/tenants and the country/industry/business-type filters). Additive only, and
built CONCURRENTLY so hot tables (sales_orders, users) are never write-locked.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'a1c4e7d93b52'
down_revision: str | None = '9f773bd126d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEXES: list[tuple[str, str, list[str]]] = [
    ("ix_sales_orders_ordered_at", "sales_orders", ["ordered_at"]),
    ("ix_tenants_created_at", "tenants", ["created_at"]),
    ("ix_tenants_country", "tenants", ["country"]),
    ("ix_tenants_industry", "tenants", ["industry"]),
    ("ix_tenants_business_type", "tenants", ["business_type"]),
    ("ix_users_created_at", "users", ["created_at"]),
]


def upgrade() -> None:
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for name, table, columns in _INDEXES:
            op.create_index(name, table, columns, postgresql_concurrently=True, if_not_exists=True)


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name, table, _ in reversed(_INDEXES):
            op.drop_index(name, table_name=table, postgresql_concurrently=True, if_exists=True)
