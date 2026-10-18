"""credit daily limit and credit-sale approval

Adds the per-customer daily credit limit to tenants, the approval/credit columns to sales orders, and the
`credit` permission resource (credit:create/read/update/delete/approve) granted to every existing Admin role.

Revision ID: c4d1a7e92b10
Revises: f6b8d0e2a4c6
Create Date: 2026-10-18 10:00:00

"""
import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c4d1a7e92b10'
down_revision: str | None = 'f6b8d0e2a4c6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIONS = ["create", "read", "update", "delete", "approve"]


def upgrade() -> None:
    op.add_column('tenants', sa.Column('credit_daily_limit', sa.Numeric(14, 2), nullable=True))
    op.add_column('sales_orders', sa.Column('credit_base', sa.Numeric(14, 2), nullable=True))
    op.add_column('sales_orders', sa.Column('requested_paid', sa.Numeric(14, 2), nullable=True))
    op.add_column('sales_orders', sa.Column('approved_by', sa.UUID(), nullable=True))
    op.add_column('sales_orders', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('sales_orders', sa.Column('approval_note', sa.Text(), nullable=True))
    op.create_foreign_key('fk_sales_orders_approved_by_users', 'sales_orders', 'users', ['approved_by'], ['id'], ondelete='SET NULL')
    # Daily-total lookups: (tenant, customer, day) over completed sales.
    op.create_index('ix_sales_orders_tenant_customer_ordered', 'sales_orders', ['tenant_id', 'customer_id', 'ordered_at'])

    # Permission catalog + existing Admin roles. Other roles are untouched: approving credit is a GM/CEO power.
    bind = op.get_bind()
    perms = sa.table('permissions', sa.column('id', sa.UUID()), sa.column('name', sa.String()), sa.column('resource', sa.String()),
                     sa.column('action', sa.String()), sa.column('description', sa.String()))
    for action in _ACTIONS:
        name = f"credit:{action}"
        exists = bind.execute(sa.select(perms.c.id).where(perms.c.name == name)).first()
        if exists is None:
            bind.execute(perms.insert().values(id=uuid.uuid4(), name=name, resource="credit", action=action, description=f"Can {action} credit"))
    bind.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.name = 'Admin' AND p.resource = 'credit'
          AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id)
    """))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE resource = 'credit')"))
    bind.execute(sa.text("DELETE FROM permissions WHERE resource = 'credit'"))
    op.drop_index('ix_sales_orders_tenant_customer_ordered', table_name='sales_orders')
    op.drop_constraint('fk_sales_orders_approved_by_users', 'sales_orders', type_='foreignkey')
    for col in ('approval_note', 'approved_at', 'approved_by', 'requested_paid', 'credit_base'):
        op.drop_column('sales_orders', col)
    op.drop_column('tenants', 'credit_daily_limit')
