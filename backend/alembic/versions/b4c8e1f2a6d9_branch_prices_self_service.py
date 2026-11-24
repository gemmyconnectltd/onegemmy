"""Branch prices for the business itself: a Pesaa setting allowing it, and the branch_prices:manage permission

Revision ID: b4c8e1f2a6d9
Revises: 9e2a6c4d1b38

Adds tenants.branch_pricing_self_service (true: the owner may switch branch prices on and off themselves; Pesaa can turn
this off per business). Adds the permission branch_prices:manage and gives it to the built-in roles that manage branch
prices (Admin, Owner/CEO, General Manager, Branch Manager, Inventory Manager, Store Manager) in every business. Custom
roles get it only when an owner grants it. No price, product or sale changes.
Rollback: `alembic downgrade 9e2a6c4d1b38` removes the permission (and its grants) and the setting.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b4c8e1f2a6d9"
down_revision: str | None = "9e2a6c4d1b38"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLES = ("Admin", "Owner/CEO", "General Manager", "Branch Manager", "Inventory Manager", "Store Manager")


def upgrade() -> None:
    op.add_column("tenants", sa.Column("branch_pricing_self_service", sa.Boolean, nullable=False, server_default=sa.true()))
    op.execute(sa.text("""
        INSERT INTO permissions (id, name, resource, action, description, created_at, updated_at)
        SELECT gen_random_uuid(), 'branch_prices:manage', 'branch_prices', 'manage', 'Can set prices and hide products per branch', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'branch_prices:manage')
    """))
    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE p.name = 'branch_prices:manage' AND r.name = ANY(:roles)
          AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id)
    """).bindparams(sa.bindparam("roles", value=list(ROLES), type_=sa.ARRAY(sa.String))))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE name = 'branch_prices:manage')"))
    op.execute(sa.text("DELETE FROM permissions WHERE name = 'branch_prices:manage'"))
    op.drop_column("tenants", "branch_pricing_self_service")
