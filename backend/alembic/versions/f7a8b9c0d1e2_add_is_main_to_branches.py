"""add is_main to branches

Revision ID: f7a8b9c0d1e2
Revises: 4152e08f713b
Create Date: 2026-10-04 15:10:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f7a8b9c0d1e2'
down_revision: str | None = 'merge_service_branch'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("branches", sa.Column("is_main", sa.Boolean(), nullable=False, server_default="false"))

    conn = op.get_bind()
    # Backfill: every tenant that has at least one branch needs exactly one
    # marked is_main. Prefer a branch literally named "Main Branch" (the
    # seed_default_branch/registration convention used before this column
    # existed); otherwise fall back to the tenant's oldest branch.
    tenants = conn.execute(sa.text("SELECT DISTINCT tenant_id FROM branches")).fetchall()
    for (tenant_id,) in tenants:
        preferred = conn.execute(
            sa.text("""
                SELECT id FROM branches
                WHERE tenant_id = :tenant_id AND name = 'Main Branch'
                ORDER BY created_at ASC LIMIT 1
            """),
            {"tenant_id": str(tenant_id)},
        ).fetchone()
        if preferred is None:
            preferred = conn.execute(
                sa.text("""
                    SELECT id FROM branches WHERE tenant_id = :tenant_id
                    ORDER BY created_at ASC LIMIT 1
                """),
                {"tenant_id": str(tenant_id)},
            ).fetchone()
        conn.execute(
            sa.text("UPDATE branches SET is_main = true WHERE id = :id"),
            {"id": str(preferred[0])},
        )

    # Defense in depth: even if a future bug in the service layer tries to
    # set a second main branch for the same tenant, the database rejects it.
    op.create_index(
        "uq_branches_tenant_main", "branches", ["tenant_id"],
        unique=True, postgresql_where=sa.text("is_main = true"),
    )


def downgrade() -> None:
    op.drop_index("uq_branches_tenant_main", table_name="branches")
    op.drop_column("branches", "is_main")
