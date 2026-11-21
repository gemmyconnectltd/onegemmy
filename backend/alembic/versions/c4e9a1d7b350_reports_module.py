"""Business reports becomes a module of its own

Revision ID: c4e9a1d7b350
Revises: b7d4f0a2c613

Reports used to ride on the "sales" flag. It gets its own flag so Pesaa can sell, switch on and restrict it per business,
and a business administrator can turn it off. Nobody loses anything: a business Pesaa restricted from Sales, or whose
administrator switched Sales off, gets the same for Reports. Plan prices are frozen history and are not edited: plans made
before this change are read as covering Reports wherever they cover Sales (see resolve_modules).
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c4e9a1d7b350'
down_revision: str | None = 'b7d4f0a2c613'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("""
        INSERT INTO feature_flags (id, key, name, module, description, default_enabled, is_active)
        SELECT gen_random_uuid(), 'reports', 'Business reports', 'reports',
               'Overview, daily branch report, team performance, sales, finance, stock, purchases and customer reports', true, true
        WHERE NOT EXISTS (SELECT 1 FROM feature_flags f WHERE f.key = 'reports')
    """))
    # A business Pesaa restricted from Sales stays restricted from what used to be part of it.
    op.execute(sa.text("""
        UPDATE tenants SET features = features || jsonb_build_object('reports', features->'sales')
        WHERE jsonb_exists(features, 'sales') AND NOT jsonb_exists(features, 'reports')
    """))
    # A business administrator who switched Sales off had switched Reports off with it.
    op.execute(sa.text("""
        UPDATE tenants SET module_activation = module_activation || jsonb_build_object('reports', module_activation->'sales')
        WHERE jsonb_exists(module_activation, 'sales') AND NOT jsonb_exists(module_activation, 'reports')
    """))


def downgrade() -> None:
    op.execute(sa.text("UPDATE tenants SET features = features - 'reports', module_activation = module_activation - 'reports'"))
    op.execute(sa.text("DELETE FROM feature_flags WHERE key = 'reports'"))
