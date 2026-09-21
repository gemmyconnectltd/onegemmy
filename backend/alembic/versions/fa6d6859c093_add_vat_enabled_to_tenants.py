"""add vat_enabled to tenants

Revision ID: fa6d6859c093
Revises: 48c7692d84ef
Create Date: 2026-09-21 11:12:13.610530

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'fa6d6859c093'
down_revision: str | None = '48c7692d84ef'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing tenants predate the flag and should keep charging VAT.
    op.add_column(
        'tenants',
        sa.Column('vat_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column('tenants', 'vat_enabled')
