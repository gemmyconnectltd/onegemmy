"""Fingerprint of each gallery picture, so importing the same spreadsheet again does not duplicate pictures.

Revision ID: a1d4e7b2c593
Revises: f7c2d9a4b681
"""
import sqlalchemy as sa

from alembic import op

revision = "a1d4e7b2c593"
down_revision = "f7c2d9a4b681"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory_product_images", sa.Column("sha256", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("inventory_product_images", "sha256")
