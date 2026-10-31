"""approval rules: debt limit per client and which requests need approval

Revision ID: b7e2d9c4a118
Revises: a4d8e1b6c207
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'b7e2d9c4a118'
down_revision: str | None = 'a4d8e1b6c207'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('debt_limit_per_client', sa.Numeric(14, 2), nullable=True, server_default='200000'))
    op.add_column('tenants', sa.Column('approval_rules', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'))


def downgrade() -> None:
    op.drop_column('tenants', 'approval_rules')
    op.drop_column('tenants', 'debt_limit_per_client')
