"""add client_order_id to sales orders

Revision ID: 497c60859524
Revises: 0e726f82fc3e
Create Date: 2026-08-10 15:13:11.867850

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '497c60859524'
down_revision: Union[str, None] = '0e726f82fc3e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sales_orders', sa.Column('client_order_id', sa.String(length=100), nullable=True))
    op.create_index('uq_sales_orders_tenant_client', 'sales_orders', ['tenant_id', 'client_order_id'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_sales_orders_tenant_client', table_name='sales_orders')
    op.drop_column('sales_orders', 'client_order_id')
