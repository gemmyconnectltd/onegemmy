"""One unit per name in a business

Revision ID: 7c4e2a9b1d05
Revises: 53b76a1ccdfe

Units with the same name in one business (case and spaces ignored, e.g. two "Piece") are merged into the oldest: products using a duplicate
as their unit, sale unit or purchase unit now point at the one kept, and the duplicates are removed. A unique index then stops new ones.
Rollback: `alembic downgrade 53b76a1ccdfe` drops the index; merged duplicates are not recreated.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "7c4e2a9b1d05"
down_revision: str | None = "53b76a1ccdfe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KEPT = """
    WITH ranked AS (
        SELECT id, first_value(id) OVER (PARTITION BY tenant_id, lower(btrim(name)) ORDER BY created_at, id) AS keep
        FROM inventory_units
    )
    SELECT id, keep FROM ranked WHERE id <> keep
"""


def upgrade() -> None:
    for column in ("unit_id", "sale_unit_id", "purchase_unit_id"):
        op.execute(f"UPDATE inventory_products p SET {column} = d.keep FROM ({KEPT}) d WHERE p.{column} = d.id")
    op.execute(f"DELETE FROM inventory_units u USING ({KEPT}) d WHERE u.id = d.id")
    op.execute("CREATE UNIQUE INDEX uq_inventory_units_tenant_name ON inventory_units (tenant_id, lower(btrim(name)))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_inventory_units_tenant_name")
