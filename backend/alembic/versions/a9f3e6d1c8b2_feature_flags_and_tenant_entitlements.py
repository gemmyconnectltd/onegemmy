"""feature flags and tenant entitlements

Revision ID: a9f3e6d1c8b2
Revises: 80f8e2ce4e3c
Create Date: 2026-08-11 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a9f3e6d1c8b2'
down_revision: Union[str, None] = '80f8e2ce4e3c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'feature_flags',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('key', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('module', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('default_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_feature_flags_key'), 'feature_flags', ['key'], unique=True)
    op.create_index(op.f('ix_feature_flags_module'), 'feature_flags', ['module'], unique=False)

    op.add_column('tenants', sa.Column('features', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('tenants', sa.Column('limits', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    op.execute(sa.text("""
        INSERT INTO feature_flags (id, key, name, module, description, default_enabled, is_active) VALUES
        ('10000000-0000-0000-0000-000000000001', 'inventory', 'Inventory & Stock', 'inventory',
         'Product catalog, stock levels, transfers and reordering', true, true),
        ('10000000-0000-0000-0000-000000000002', 'sales', 'Sales & POS', 'sales',
         'Sales orders, receipts and point of sale', true, true),
        ('10000000-0000-0000-0000-000000000003', 'finance', 'Finance & Accounting', 'finance',
         'Transactions, invoices, expenses and reports', true, true),
        ('10000000-0000-0000-0000-000000000004', 'hr', 'HR & Staff', 'hr',
         'Employees, attendance and payroll', true, true),
        ('10000000-0000-0000-0000-000000000005', 'procurement', 'Procurement & Purchases', 'procurement',
         'Purchase orders, suppliers and receivings', true, true),
        ('10000000-0000-0000-0000-000000000006', 'crm', 'Customers & CRM', 'crm',
         'Customer management, loyalty and follow-ups', true, true),
        ('10000000-0000-0000-0000-000000000007', 'manufacturing', 'Manufacturing', 'manufacturing',
         'BOMs, work orders and production', true, true)
    """))
    op.execute(sa.text("UPDATE tenants SET features = '{}'::jsonb WHERE features IS NULL"))
    op.execute(sa.text("UPDATE tenants SET limits = '{}'::jsonb WHERE limits IS NULL"))


def downgrade() -> None:
    op.drop_index(op.f('ix_feature_flags_module'), table_name='feature_flags')
    op.drop_index(op.f('ix_feature_flags_key'), table_name='feature_flags')
    op.drop_table('feature_flags')
    op.drop_column('tenants', 'limits')
    op.drop_column('tenants', 'features')
