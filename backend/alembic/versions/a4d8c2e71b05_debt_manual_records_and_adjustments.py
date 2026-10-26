"""debt manual records and adjustments

Revision ID: a4d8c2e71b05
Revises: f9c3d7a52e18
Create Date: 2026-10-26 10:20:41.900057

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a4d8c2e71b05'
down_revision: Union[str, None] = 'f9c3d7a52e18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('accounting_debt_adjustments',
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('document_id', sa.UUID(), nullable=False),
    sa.Column('action', sa.String(length=10), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('reason', sa.String(length=500), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('actor_name', sa.String(length=255), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_accounting_debt_adjustments_doc', 'accounting_debt_adjustments', ['tenant_id', 'kind', 'document_id'], unique=False)
    op.create_index(op.f('ix_accounting_debt_adjustments_tenant_id'), 'accounting_debt_adjustments', ['tenant_id'], unique=False)
    op.create_table('accounting_manual_debts',
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('reference', sa.String(length=50), nullable=False),
    sa.Column('customer_id', sa.UUID(), nullable=True),
    sa.Column('supplier_id', sa.UUID(), nullable=True),
    sa.Column('branch_id', sa.UUID(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('amount_paid', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('issue_date', sa.Date(), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency_code', sa.String(length=3), nullable=True),
    sa.Column('exchange_rate', sa.Numeric(precision=20, scale=10), nullable=True),
    sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['customer_id'], ['sales_customers.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['supplier_id'], ['inventory_suppliers.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_accounting_manual_debts_scope', 'accounting_manual_debts', ['tenant_id', 'kind', 'branch_id'], unique=False)
    op.create_index(op.f('ix_accounting_manual_debts_tenant_id'), 'accounting_manual_debts', ['tenant_id'], unique=False)
    op.create_index('uq_accounting_manual_debts_ref', 'accounting_manual_debts', ['tenant_id', 'reference'], unique=True)
    op.create_table('accounting_manual_debt_payments',
    sa.Column('debt_id', sa.UUID(), nullable=False),
    sa.Column('reference', sa.String(length=60), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('payment_method', sa.String(length=20), nullable=True),
    sa.Column('reference_number', sa.String(length=100), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('paid_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['debt_id'], ['accounting_manual_debts.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_accounting_manual_debt_payments_debt', 'accounting_manual_debt_payments', ['tenant_id', 'debt_id'], unique=False)
    op.create_index(op.f('ix_accounting_manual_debt_payments_tenant_id'), 'accounting_manual_debt_payments', ['tenant_id'], unique=False)
    op.create_index('uq_accounting_manual_debt_payments_ref', 'accounting_manual_debt_payments', ['tenant_id', 'reference'], unique=True)


def downgrade() -> None:
    op.drop_table("accounting_manual_debt_payments")
    op.drop_table("accounting_manual_debts")
    op.drop_table("accounting_debt_adjustments")
