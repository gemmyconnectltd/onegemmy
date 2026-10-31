"""withdrawn: bulk enable of every module (no-op)

This revision originally cleared tenants.features and tenants.module_activation for
every business. It was withdrawn because each business keeps its own module settings.
The revision id is kept so databases that already recorded it still resolve their
history; it changes nothing.

Revision ID: e8b4c2d7a915
Revises: d6e1f8a3b290
"""
from collections.abc import Sequence

revision: str = 'e8b4c2d7a915'
down_revision: str | None = 'd6e1f8a3b290'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
