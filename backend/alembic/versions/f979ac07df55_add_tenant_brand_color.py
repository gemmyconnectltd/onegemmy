"""add tenant brand_color

Revision ID: f979ac07df55
Revises: a54473250090
Create Date: 2026-09-01 16:18:01.509501

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f979ac07df55'
down_revision: str | None = 'a54473250090'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("brand_color", sa.String(length=7), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "brand_color")
