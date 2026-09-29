"""add phone and email to branches

Revision ID: e6c78e180752
Revises: e2f3a4b5c6d7
Create Date: 2026-09-29 13:19:11.421042

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'e6c78e180752'
down_revision: str | None = 'e2f3a4b5c6d7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The Branch model already declared these two columns with no migration
    # ever shipped for them — this was blocking any query that touches
    # tenant.branches (including registration) against a real database.
    #
    # Autogenerate also picked up a large batch of unrelated index renames
    # (accounting_* tables still carry index names from before they were
    # renamed from finance_*) — that's pre-existing drift between the model
    # and a historical migration, not something to fold in here; left alone,
    # same as the similar users.email drift documented in c4e8a1f70b92.
    op.add_column('branches', sa.Column('phone', sa.String(length=50), nullable=True))
    op.add_column('branches', sa.Column('email', sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column('branches', 'email')
    op.drop_column('branches', 'phone')
