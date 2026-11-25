"""Sales Manager can record customer payments (accounts_receivable:create)

Revision ID: c7d3a9e5f210
Revises: b4c8e1f2a6d9

The built-in Sales Manager role could see what customers owe but not record a payment, so the Record payment button was
hidden for them. This gives accounts_receivable:create to every business's Sales Manager role. Reversing a payment
(accounts_receivable:delete) stays with finance roles. Custom roles are unchanged. No sale or payment data changes.
Rollback: `alembic downgrade b4c8e1f2a6d9` removes the grant from Sales Manager roles.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c7d3a9e5f210"
down_revision: str | None = "b4c8e1f2a6d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("""
        INSERT INTO permissions (id, name, resource, action, description, created_at, updated_at)
        SELECT gen_random_uuid(), 'accounts_receivable:create', 'accounts_receivable', 'create', 'Can record customer payments', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'accounts_receivable:create')
    """))
    op.execute(sa.text("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE p.name = 'accounts_receivable:create' AND r.name = 'Sales Manager'
          AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id)
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name = 'Sales Manager')
          AND permission_id IN (SELECT id FROM permissions WHERE name = 'accounts_receivable:create')
    """))
