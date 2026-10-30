"""enable every module for every business (one-off)

Clears Pesaa's restrictions (tenants.features) and the businesses' own switches
(tenants.module_activation). Plan entitlements are untouched. Runs once per database,
on the next `alembic upgrade head` (local and production).

Revision ID: e8b4c2d7a915
Revises: d6e1f8a3b290
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'e8b4c2d7a915'
down_revision: str | None = 'd6e1f8a3b290'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("UPDATE tenants SET features = '{}'::jsonb, module_activation = '{}'::jsonb")


def downgrade() -> None:
    # The cleared overrides are not recoverable; nothing to undo.
    pass
