"""users who must choose a new password at next sign-in

Set when a platform administrator gives someone a default password. Existing users are unchanged.

Revision ID: e5c3a9d1b742
Revises: d4b9f1e7a203
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'e5c3a9d1b742'
down_revision: str | None = 'd4b9f1e7a203'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('users', 'must_change_password')
