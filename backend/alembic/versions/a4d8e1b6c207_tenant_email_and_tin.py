"""business email and TIN for receipts and invoices

Revision ID: a4d8e1b6c207
Revises: f2c7a91d4b38
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'a4d8e1b6c207'
down_revision: str | None = 'f2c7a91d4b38'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('email', sa.String(length=255), nullable=True))
    op.add_column('tenants', sa.Column('tin', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'tin')
    op.drop_column('tenants', 'email')
