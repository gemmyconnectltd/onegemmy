"""Stock by branch: per-branch reorder levels, and a warehouse of its own for every branch

Revision ID: e5a2c7d9b4f1
Revises: d8e4b1c6a3f7

1. New table inventory_branch_reorder_levels: a branch's own reorder level for a product or variant. Without a row a branch uses
   the product's min_stock, so nothing changes until someone sets one.
2. In every business that uses warehouses, each active branch without a warehouse gets "<Branch> warehouse" (code WH-nnn).
   The new warehouses start EMPTY. No stock is moved: what those branches used to sell from (the default warehouse, which
   belongs to another branch or to nobody) stays where it is, and is printed below per business so it can be transferred.
   From now on a branch sells only from its own warehouse, or from a shared one (no branch owns it), never from another
   branch's, so until stock is transferred in, such a branch has 0 to sell of anything held elsewhere.
Rollback: `alembic downgrade d8e4b1c6a3f7` drops the table and removes the warehouses created here, but only while they have no
movements (a warehouse that has been used is kept, and the downgrade says so).
"""
import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e5a2c7d9b4f1"
down_revision: str | None = "d8e4b1c6a3f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NOTE = "Created by migration e5a2c7d9b4f1 (every branch keeps its own stock)"


def upgrade() -> None:
    op.create_table(
        "inventory_branch_reorder_levels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inventory_product_variants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reorder_level", sa.Numeric(14, 3), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_inventory_branch_reorder_levels_tenant_id", "inventory_branch_reorder_levels", ["tenant_id"])
    op.create_index("ix_branch_reorder_tenant_branch", "inventory_branch_reorder_levels", ["tenant_id", "branch_id"])
    op.create_index("uq_branch_reorder_product", "inventory_branch_reorder_levels", ["tenant_id", "product_id", "branch_id"], unique=True,
                    postgresql_where=sa.text("variant_id IS NULL"))
    op.create_index("uq_branch_reorder_variant", "inventory_branch_reorder_levels", ["tenant_id", "variant_id", "branch_id"], unique=True,
                    postgresql_where=sa.text("variant_id IS NOT NULL"))
    _give_every_branch_a_warehouse()


def _give_every_branch_a_warehouse() -> None:
    conn = op.get_bind()
    tenants = conn.execute(sa.text("SELECT DISTINCT tenant_id FROM inventory_warehouses")).scalars().all()
    for tenant_id in tenants:
        missing = conn.execute(sa.text(
            "SELECT b.id, b.name FROM branches b WHERE b.tenant_id = :t AND b.status = 'active' "
            "AND NOT EXISTS (SELECT 1 FROM inventory_warehouses w WHERE w.tenant_id = :t AND w.branch_id = b.id) ORDER BY b.is_main DESC, b.name"),
            {"t": tenant_id}).all()
        if not missing:
            continue
        codes = set(conn.execute(sa.text("SELECT code FROM inventory_warehouses WHERE tenant_id = :t"), {"t": tenant_id}).scalars().all())
        top = max((int(c[3:]) for c in codes if c.startswith("WH-") and c[3:].isdigit()), default=0)
        for branch_id, name in missing:
            top += 1
            while f"WH-{top:03d}" in codes:
                top += 1
            codes.add(f"WH-{top:03d}")
            conn.execute(sa.text(
                "INSERT INTO inventory_warehouses (id, tenant_id, code, name, branch_id, description, is_active, is_default, created_at, updated_at) "
                "VALUES (:id, :t, :code, :name, :b, :d, true, false, now(), now())"),
                {"id": uuid.uuid4(), "t": tenant_id, "code": f"WH-{top:03d}", "name": f"{name} warehouse"[:150], "b": branch_id, "d": NOTE})
        _report(conn, tenant_id, [name for _, name in missing])


def _report(conn, tenant_id, branches: list[str]) -> None:
    """Print the stock those branches used to sell from, which stays where it is."""
    tenant = conn.execute(sa.text("SELECT name FROM tenants WHERE id = :t"), {"t": tenant_id}).scalar_one()
    rows = conn.execute(sa.text(
        "SELECT w.name, coalesce(b.name, 'no branch (shared)'), p.name, sum(m.quantity) FROM inventory_stock_movements m "
        "JOIN inventory_warehouses w ON w.id = m.warehouse_id LEFT JOIN branches b ON b.id = w.branch_id "
        "JOIN inventory_products p ON p.id = m.product_id WHERE m.tenant_id = :t AND w.is_default "
        "GROUP BY w.name, b.name, p.name HAVING sum(m.quantity) <> 0 ORDER BY p.name"), {"t": tenant_id}).all()
    print(f"[stock by branch] {tenant}: new empty warehouses for {', '.join(branches)}.")
    if rows:
        print(f"[stock by branch] {tenant}: these branches used to sell from {rows[0][0]} (owned by {rows[0][1]}), which still holds "
              f"{len(rows)} products; transfer what each branch keeps:")
        for _, _, product, qty in rows:
            print(f"[stock by branch]   {product}: {float(qty):g}")


def downgrade() -> None:
    conn = op.get_bind()
    kept = conn.execute(sa.text(
        "SELECT w.code FROM inventory_warehouses w WHERE w.description = :d AND EXISTS "
        "(SELECT 1 FROM inventory_stock_movements m WHERE m.warehouse_id = w.id)"), {"d": NOTE}).scalars().all()
    if kept:
        print(f"[stock by branch] keeping warehouses that have been used since: {', '.join(kept)}")
    conn.execute(sa.text(
        "DELETE FROM inventory_warehouses w WHERE w.description = :d AND NOT EXISTS "
        "(SELECT 1 FROM inventory_stock_movements m WHERE m.warehouse_id = w.id) AND NOT EXISTS "
        "(SELECT 1 FROM inventory_stock_counts c WHERE c.warehouse_id = w.id)"), {"d": NOTE})
    op.drop_table("inventory_branch_reorder_levels")
