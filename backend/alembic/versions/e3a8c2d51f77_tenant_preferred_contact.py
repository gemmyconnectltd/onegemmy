"""tenants.preferred_contact — how the business wants Pesaa to reach it (email | phone | whatsapp)

Revision ID: e3a8c2d51f77
Revises: 8fd4b31c9e20
Create Date: 2026-10-18 17:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'e3a8c2d51f77'
down_revision: str | None = '8fd4b31c9e20'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing businesses signed up with an email and have never been asked: email is the safe default.
    op.add_column('tenants', sa.Column('preferred_contact', sa.String(10), nullable=False, server_default='email'))


def downgrade() -> None:
    op.drop_column('tenants', 'preferred_contact')
