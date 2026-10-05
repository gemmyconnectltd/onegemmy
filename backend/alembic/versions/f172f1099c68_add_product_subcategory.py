"""add product subcategory

Revision ID: f172f1099c68
Revises: a3b4c5d6e7f8
Create Date: 2026-10-05 20:42:28.303227

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f172f1099c68'
down_revision: str | None = 'a3b4c5d6e7f8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inventory_products", sa.Column("subcategory", sa.String(length=255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("inventory_products", "subcategory")
