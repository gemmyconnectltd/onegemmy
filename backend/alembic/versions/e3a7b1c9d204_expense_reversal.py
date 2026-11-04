"""expense reversal trail

Adds who/when/why an approved expense was reversed, and the reversing journal. Existing rows are untouched.

Revision ID: e3a7b1c9d204
Revises: c5f1a8d3e902
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'e3a7b1c9d204'
down_revision: str | None = 'c5f1a8d3e902'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('accounting_expenses', sa.Column('reversed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('accounting_expenses', sa.Column('reversed_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('accounting_expenses', sa.Column('reversal_reason', sa.Text(), nullable=True))
    op.add_column('accounting_expenses', sa.Column('reversal_transaction_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('accounting_transactions.id', ondelete='SET NULL'), nullable=True))


def downgrade() -> None:
    op.drop_column('accounting_expenses', 'reversal_transaction_id')
    op.drop_column('accounting_expenses', 'reversal_reason')
    op.drop_column('accounting_expenses', 'reversed_by')
    op.drop_column('accounting_expenses', 'reversed_at')
