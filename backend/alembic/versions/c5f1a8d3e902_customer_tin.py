"""business customers carry a TIN

Revision ID: c5f1a8d3e902
Revises: d9b7e302a164
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c5f1a8d3e902'
down_revision: str | None = 'd9b7e302a164'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('sales_customers', sa.Column('tin', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('sales_customers', 'tin')
