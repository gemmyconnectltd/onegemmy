"""add pos payment fields to sales orders

Revision ID: 9779114a1a99
Revises: c33ee50223de
Create Date: 2026-09-17 23:56:46.838074

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9779114a1a99'
down_revision: Union[str, None] = 'c33ee50223de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sales_orders', sa.Column('payment_method', sa.String(length=20), nullable=True))
    op.add_column('sales_orders', sa.Column('amount_tendered', sa.Numeric(precision=14, scale=2), nullable=True))
    op.add_column('sales_orders', sa.Column('change_due', sa.Numeric(precision=14, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('sales_orders', 'change_due')
    op.drop_column('sales_orders', 'amount_tendered')
    op.drop_column('sales_orders', 'payment_method')
