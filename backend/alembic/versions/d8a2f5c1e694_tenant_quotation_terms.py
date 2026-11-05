"""Standing quotation wording per business: bank details and notes printed at the foot of its quotations.

Revision ID: d8a2f5c1e694
Revises: c6e1a8f3d527
"""
import sqlalchemy as sa

from alembic import op

revision = "d8a2f5c1e694"
down_revision = "c6e1a8f3d527"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("quotation_terms", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "quotation_terms")
