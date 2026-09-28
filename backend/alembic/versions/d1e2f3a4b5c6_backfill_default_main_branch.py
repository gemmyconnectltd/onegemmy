"""backfill default main branch for existing tenants

Revision ID: d1e2f3a4b5c6
Revises: c4e8a1f70b92
Create Date: 2026-09-28 00:00:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c4e8a1f70b92"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Find all tenants that have no branches yet
    tenants = conn.execute(
        sa.text("""
            SELECT id FROM tenants
            WHERE id NOT IN (SELECT DISTINCT tenant_id FROM branches)
        """)
    ).fetchall()

    for (tenant_id,) in tenants:
        conn.execute(
            sa.text("""
                INSERT INTO branches (id, tenant_id, name, status, created_at, updated_at)
                VALUES (:id, :tenant_id, 'Main Branch', 'active', NOW(), NOW())
            """),
            {"id": str(uuid.uuid4()), "tenant_id": str(tenant_id)},
        )


def downgrade() -> None:
    # Remove only branches named "Main Branch" that are the sole branch for their tenant
    # (safe — won't touch tenants that had branches before this migration)
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            DELETE FROM branches
            WHERE name = 'Main Branch'
              AND tenant_id IN (
                SELECT tenant_id FROM branches
                GROUP BY tenant_id
                HAVING COUNT(*) = 1
              )
        """)
    )
