"""add supplier lead time

Revision ID: f6b8d0e2a4c6
Revises: e5a7b9c1d3f5
Create Date: 2026-10-11 14:00:00.000000

Optional days-to-deliver per supplier so Pesaa AI reorder advice can cover the delivery wait. Additive.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f6b8d0e2a4c6'
down_revision: str | None = 'e5a7b9c1d3f5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("inventory_suppliers", sa.Column("lead_time_days", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_suppliers", "lead_time_days")
