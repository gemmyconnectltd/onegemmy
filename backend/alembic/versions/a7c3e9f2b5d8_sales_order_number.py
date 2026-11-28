"""Sales orders: a sale saved before it is completed has its own SO- number

Revision ID: a7c3e9f2b5d8
Revises: f3b9d2e7a1c4

Adds sales_orders.sales_order_number (nullable). From now on an open or held sale is numbered SO-0001…, and when it is
completed it takes the next INV- number and keeps its SO- number in this column. Existing sales keep their numbers.
Rollback drops the column (completed sales lose their "Order ref."; their INV- numbers stay).
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7c3e9f2b5d8"
down_revision: str | None = "f3b9d2e7a1c4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sales_orders", sa.Column("sales_order_number", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("sales_orders", "sales_order_number")
