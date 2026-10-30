"""tenant module activation and the missing repairs feature flag

Revision ID: c3a9d51e7f26
Revises: b7e2f4a91c03
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'c3a9d51e7f26'
down_revision: str | None = 'b7e2f4a91c03'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('tenants', sa.Column('module_activation', postgresql.JSONB(astext_type=sa.Text()),
                                       server_default='{}', nullable=False))
    # The repairs API is gated on a "repairs" flag that was never created, so it refused every business.
    # Off by default: only plans that include it grant it.
    op.execute(sa.text("""
        INSERT INTO feature_flags (id, key, name, module, description, default_enabled, is_active)
        SELECT gen_random_uuid(), 'repairs', 'Repairs', 'repairs',
               'Repair jobs, parts used and customer hand-over', false, true
        WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = 'repairs')
    """))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM feature_flags WHERE key = 'repairs'"))
    op.drop_column('tenants', 'module_activation')
