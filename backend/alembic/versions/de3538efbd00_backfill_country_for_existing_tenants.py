"""backfill country for existing tenants

Revision ID: de3538efbd00
Revises: fa6d6859c093
Create Date: 2026-09-21 16:49:30.720303

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'de3538efbd00'
down_revision: str | None = 'fa6d6859c093'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Tenants registered before the register form started persisting `country`
    # have an empty/NULL value. The platform's home market is Rwanda, and the
    # admin "New Tenant" form already defaults to "Rwanda", so backfill old
    # rows with that same default — new signups capture their real country.
    op.execute(
        sa.text(
            "UPDATE tenants SET country = 'Rwanda' "
            "WHERE country IS NULL OR country = ''"
        )
    )


def downgrade() -> None:
    # Irreversible by design — we don't know what the original values were.
    pass