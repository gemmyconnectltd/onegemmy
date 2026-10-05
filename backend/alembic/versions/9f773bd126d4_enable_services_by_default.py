"""enable services by default

Revision ID: 9f773bd126d4
Revises: f172f1099c68
Create Date: 2026-10-05 21:37:19.438024

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '9f773bd126d4'
down_revision: str | None = 'f172f1099c68'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text(
        "UPDATE feature_flags SET default_enabled = true "
        "WHERE key IN ('services', 'appointments', 'queue')"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "UPDATE feature_flags SET default_enabled = false "
        "WHERE key IN ('services', 'appointments', 'queue')"
    ))
