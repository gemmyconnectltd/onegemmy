"""add manufacturing bill of materials

Revision ID: fc55db2408ee
Revises: f979ac07df55
Create Date: 2026-09-01 16:55:34.921279

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'fc55db2408ee'
down_revision: str | None = 'f979ac07df55'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('manufacturing_boms',
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('product_id', sa.UUID(), nullable=True),
    sa.Column('product_name', sa.String(length=255), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('tenant_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['product_id'], ['inventory_products.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tenant_id', 'product_id', 'name', name='uq_manufacturing_boms_tenant_product_name')
    )
    op.create_index('ix_manufacturing_boms_tenant_product', 'manufacturing_boms', ['tenant_id', 'product_id'], unique=False)
    op.create_index(op.f('ix_manufacturing_boms_tenant_id'), 'manufacturing_boms', ['tenant_id'], unique=False)
    op.create_table('manufacturing_bom_items',
    sa.Column('bom_id', sa.UUID(), nullable=False),
    sa.Column('component_product_id', sa.UUID(), nullable=True),
    sa.Column('component_product_name', sa.String(length=255), nullable=True),
    sa.Column('quantity_required', sa.Integer(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['bom_id'], ['manufacturing_boms.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['component_product_id'], ['inventory_products.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_manufacturing_bom_items_bom_id', 'manufacturing_bom_items', ['bom_id'], unique=False)
    op.create_index('ix_manufacturing_bom_items_component_id', 'manufacturing_bom_items', ['component_product_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_manufacturing_bom_items_component_id', table_name='manufacturing_bom_items')
    op.drop_index('ix_manufacturing_bom_items_bom_id', table_name='manufacturing_bom_items')
    op.drop_table('manufacturing_bom_items')
    op.drop_index(op.f('ix_manufacturing_boms_tenant_id'), table_name='manufacturing_boms')
    op.drop_index('ix_manufacturing_boms_tenant_product', table_name='manufacturing_boms')
    op.drop_table('manufacturing_boms')
