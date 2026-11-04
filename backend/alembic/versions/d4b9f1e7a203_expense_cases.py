"""expense cases: pay later, supplier refunds, recurring expenses

Adds an unpaid (on credit) flag with its paid date, a refunded total on each expense, and a table of recurring expense templates.
Existing expenses are unchanged (paid, nothing refunded).

Revision ID: d4b9f1e7a203
Revises: c7a2e5b19d36
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'd4b9f1e7a203'
down_revision: str | None = 'c7a2e5b19d36'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('accounting_expenses', sa.Column('on_credit', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('accounting_expenses', sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('accounting_expenses', sa.Column('refunded_amount', sa.Numeric(14, 2), nullable=False, server_default='0'))
    op.create_table(
        'accounting_recurring_expenses',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('accounting_accounts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('supplier_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('inventory_suppliers.id', ondelete='SET NULL'), nullable=True),
        sa.Column('branch_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('branches.id', ondelete='SET NULL'), nullable=True),
        sa.Column('payment_method', sa.String(20), nullable=False, server_default='Cash'),
        sa.Column('on_credit', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('frequency', sa.String(10), nullable=False),
        sa.Column('next_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_recurring_expenses_tenant_next', 'accounting_recurring_expenses', ['tenant_id', 'is_active', 'next_date'])


def downgrade() -> None:
    op.drop_index('ix_recurring_expenses_tenant_next', table_name='accounting_recurring_expenses')
    op.drop_table('accounting_recurring_expenses')
    op.drop_column('accounting_expenses', 'refunded_amount')
    op.drop_column('accounting_expenses', 'paid_at')
    op.drop_column('accounting_expenses', 'on_credit')
