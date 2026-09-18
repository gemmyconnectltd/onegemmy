"""add cost_at_sale to order items

Revision ID: 47fad127534a
Revises: b0159d0bd89d
Create Date: 2026-09-18 02:13:48.071640

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '47fad127534a'
down_revision: Union[str, None] = 'b0159d0bd89d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sales_order_items', sa.Column('cost_at_sale', sa.Numeric(precision=12, scale=2), nullable=True))


def downgrade() -> None:
    op.drop_column('sales_order_items', 'cost_at_sale')
