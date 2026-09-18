"""add currency to tenants

Revision ID: 68439177800d
Revises: fc55db2408ee
Create Date: 2026-09-17 10:17:56.377087

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '68439177800d'
down_revision: Union[str, None] = 'fc55db2408ee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tenants',
        sa.Column('currency', sa.String(length=3), nullable=False, server_default='RWF'),
    )
    op.alter_column('tenants', 'currency', server_default=None)


def downgrade() -> None:
    op.drop_column('tenants', 'currency')
