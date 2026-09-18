"""add supplier bills and payments

Revision ID: 48c7692d84ef
Revises: 47fad127534a
Create Date: 2026-09-18 04:07:59.177710

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '48c7692d84ef'
down_revision: Union[str, None] = '47fad127534a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('procurement_supplier_bills',
    sa.Column('reference', sa.String(length=50), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('amount_paid', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('bill_date', sa.Date(), nullable=False),
    sa.Column('purchase_order_id', sa.UUID(), nullable=False),
    sa.Column('supplier_id', sa.UUID(), nullable=True),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['supplier_id'], ['inventory_suppliers.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_procurement_supplier_bills_tenant_id'), 'procurement_supplier_bills', ['tenant_id'], unique=False)
    op.create_index('ix_supplier_bills_purchase_order_id', 'procurement_supplier_bills', ['purchase_order_id'], unique=False)
    op.create_index('ix_supplier_bills_tenant_id', 'procurement_supplier_bills', ['tenant_id'], unique=False)
    op.create_index('ix_supplier_bills_tenant_status', 'procurement_supplier_bills', ['tenant_id', 'status'], unique=False)
    op.create_index('uq_supplier_bills_tenant_ref', 'procurement_supplier_bills', ['tenant_id', 'reference'], unique=True)
    op.create_table('procurement_supplier_payments',
    sa.Column('reference', sa.String(length=50), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('payment_method', sa.String(length=20), nullable=True),
    sa.Column('paid_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('bill_id', sa.UUID(), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['bill_id'], ['procurement_supplier_bills.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_procurement_supplier_payments_tenant_id'), 'procurement_supplier_payments', ['tenant_id'], unique=False)
    op.create_index('ix_supplier_payments_bill_id', 'procurement_supplier_payments', ['bill_id'], unique=False)
    op.create_index('ix_supplier_payments_tenant_id', 'procurement_supplier_payments', ['tenant_id'], unique=False)
    op.create_index('uq_supplier_payments_tenant_ref', 'procurement_supplier_payments', ['tenant_id', 'reference'], unique=True)


def downgrade() -> None:
    op.drop_index('uq_supplier_payments_tenant_ref', table_name='procurement_supplier_payments')
    op.drop_index('ix_supplier_payments_tenant_id', table_name='procurement_supplier_payments')
    op.drop_index('ix_supplier_payments_bill_id', table_name='procurement_supplier_payments')
    op.drop_index(op.f('ix_procurement_supplier_payments_tenant_id'), table_name='procurement_supplier_payments')
    op.drop_table('procurement_supplier_payments')
    op.drop_index('uq_supplier_bills_tenant_ref', table_name='procurement_supplier_bills')
    op.drop_index('ix_supplier_bills_tenant_status', table_name='procurement_supplier_bills')
    op.drop_index('ix_supplier_bills_tenant_id', table_name='procurement_supplier_bills')
    op.drop_index('ix_supplier_bills_purchase_order_id', table_name='procurement_supplier_bills')
    op.drop_index(op.f('ix_procurement_supplier_bills_tenant_id'), table_name='procurement_supplier_bills')
    op.drop_table('procurement_supplier_bills')
