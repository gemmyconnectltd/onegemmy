"""per-user feature access: modules switched off for one person

Revision ID: f2c7a91d4b38
Revises: e8b4c2d7a915
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'f2c7a91d4b38'
down_revision: str | None = 'e8b4c2d7a915'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('disabled_modules', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'disabled_modules')
