"""Business reports gets a dedicated read permission

Revision ID: 53b76a1ccdfe
Revises: f6b2c8a1d430

Reports are read-only and opt-in: this adds the catalog entry so owners can grant Access Management's Reports: View box to any role. Existing role grants are left untouched.
Rollback: `alembic downgrade f6b2c8a1d430`.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '53b76a1ccdfe'
down_revision: str | None = 'f6b2c8a1d430'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("""
        INSERT INTO permissions (id, name, resource, action, description, created_at, updated_at)
        SELECT gen_random_uuid(), 'reports:read', 'reports', 'read', 'Can read business reports', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = 'reports:read')
    """))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE name = 'reports:read')"))
    op.execute(sa.text("DELETE FROM permissions WHERE name = 'reports:read'"))
