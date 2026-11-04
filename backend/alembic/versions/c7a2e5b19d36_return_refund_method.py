"""how a return is settled

credit_note keeps the value as credit on the customer's account (the behaviour so far); cash/bank/mobile also pay it out.

Revision ID: c7a2e5b19d36
Revises: be98d1a3426f
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c7a2e5b19d36'
down_revision: str | None = 'be98d1a3426f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('sales_returns', sa.Column('refund_method', sa.String(length=20), nullable=False, server_default='credit_note'))


def downgrade() -> None:
    op.drop_column('sales_returns', 'refund_method')
