"""Input VAT carried by a purchase return

Revision ID: b3d7f1a9c562
Revises: a1c9e5f27d40

Additive: NULL on every return made before recoverable input VAT was split from inventory (those returns reverse
Inventory only, exactly as before). Rollback: `alembic downgrade a1c9e5f27d40`.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'b3d7f1a9c562'
down_revision: str | None = 'a1c9e5f27d40'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("purchase_returns", sa.Column("base_input_vat", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("purchase_returns", "base_input_vat")
