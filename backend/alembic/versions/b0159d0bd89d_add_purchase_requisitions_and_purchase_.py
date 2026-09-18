"""add purchase requisitions and purchase returns

Revision ID: b0159d0bd89d
Revises: 9779114a1a99
Create Date: 2026-09-18 01:45:03.291632

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b0159d0bd89d'
down_revision: Union[str, None] = '9779114a1a99'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('purchase_requisitions',
    sa.Column('reference', sa.String(length=50), nullable=False),
    sa.Column('item_name', sa.String(length=255), nullable=False),
    sa.Column('quantity', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('department_id', sa.UUID(), nullable=True),
    sa.Column('requested_by', sa.UUID(), nullable=True),
    sa.Column('decided_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['decided_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['requested_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_purchase_requisitions_tenant_id'), 'purchase_requisitions', ['tenant_id'], unique=False)
    op.create_index('ix_purchase_requisitions_tenant_status', 'purchase_requisitions', ['tenant_id', 'status'], unique=False)
    op.create_index('uq_purchase_requisitions_tenant_ref', 'purchase_requisitions', ['tenant_id', 'reference'], unique=True)
    op.create_table('purchase_returns',
    sa.Column('reference', sa.String(length=50), nullable=False),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('return_date', sa.Date(), nullable=False),
    sa.Column('purchase_order_id', sa.UUID(), nullable=False),
    sa.Column('product_id', sa.UUID(), nullable=True),
    sa.Column('variant_id', sa.UUID(), nullable=True),
    sa.Column('product_name', sa.String(length=255), nullable=False),
    sa.Column('quantity', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('processed_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['processed_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['product_id'], ['inventory_products.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['variant_id'], ['inventory_product_variants.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_purchase_returns_purchase_order_id', 'purchase_returns', ['purchase_order_id'], unique=False)
    op.create_index(op.f('ix_purchase_returns_tenant_id'), 'purchase_returns', ['tenant_id'], unique=False)
    op.create_index('uq_purchase_returns_tenant_ref', 'purchase_returns', ['tenant_id', 'reference'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_purchase_returns_tenant_ref', table_name='purchase_returns')
    op.drop_index(op.f('ix_purchase_returns_tenant_id'), table_name='purchase_returns')
    op.drop_index('ix_purchase_returns_purchase_order_id', table_name='purchase_returns')
    op.drop_table('purchase_returns')
    op.drop_index('uq_purchase_requisitions_tenant_ref', table_name='purchase_requisitions')
    op.drop_index('ix_purchase_requisitions_tenant_status', table_name='purchase_requisitions')
    op.drop_index(op.f('ix_purchase_requisitions_tenant_id'), table_name='purchase_requisitions')
    op.drop_table('purchase_requisitions')
