"""Per-business feature exceptions, feature settings and limits, activity counts, and more submodules/features

Revision ID: a3c8e5f1d907
Revises: f1b7d2e9a405

Additive only: a settings column (empty) on feature_controls, two new tables with no rows, and eight more parts
(switched on) under Accounting, Services, Manufacturing and Discounts — only where those modules exist.
Nothing any business can do changes until Pesaa sets a control. Rollback: `alembic downgrade f1b7d2e9a405`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'a3c8e5f1d907'
down_revision: str | None = 'f1b7d2e9a405'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# key, module, parent, level, name, description, sort — a frozen copy of the matching rows in feature_tree.TREE
ROWS = [
    ("accounting.recurring_expenses", "accounting", None, "feature", "Recurring expenses", "Expenses that repeat on a schedule", 20),
    ("accounting.debt_reminders", "accounting", None, "feature", "Debt reminders & statements", "Remind customers and send statements", 30),
    ("services.staff_commissions", "services", None, "feature", "Staff commissions", "Commission for staff who deliver services", 10),
    ("manufacturing.boms", "manufacturing", None, "feature", "Bills of materials", "What each product is made of", 10),
    ("manufacturing.work_orders", "manufacturing", None, "feature", "Work orders", "Produce goods from a bill of materials", 20),
    ("discounts.coupons", "discounts", None, "feature", "Coupons", "Coupon codes customers can use", 10),
    ("discounts.campaigns", "discounts", None, "feature", "Promotions", "Time-limited promotional campaigns", 20),
    ("discounts.approvals", "discounts", None, "feature", "Discount approvals", "Ask a manager to approve a discount", 30),
]


def upgrade() -> None:
    op.add_column("feature_controls", sa.Column("settings", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")))

    op.create_table(
        "feature_tenant_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("feature_key", sa.String(120), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=True),
        sa.Column("message", sa.String(500), nullable=True),
        sa.Column("actions", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("settings", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("status IS NULL OR status IN ('active', 'inactive', 'coming_soon', 'beta', 'maintenance', 'deprecated')",
                           name="ck_feature_tenant_overrides_status"),
        sa.UniqueConstraint("feature_key", "tenant_id", name="uq_feature_tenant_override"),
    )
    op.create_index("ix_feature_tenant_overrides_feature_key", "feature_tenant_overrides", ["feature_key"])
    op.create_index("ix_feature_tenant_overrides_tenant_id", "feature_tenant_overrides", ["tenant_id"])

    op.create_table(
        "feature_activity",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("feature_key", sa.String(120), primary_key=True),
        sa.Column("day", sa.Date, primary_key=True),
        sa.Column("action", sa.String(10), primary_key=True),
        sa.Column("count", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_feature_activity_key_day", "feature_activity", ["feature_key", "day"])

    insert = sa.text("""
        INSERT INTO module_features (id, key, module_key, parent_key, level, name, description, sort_order, is_active)
        SELECT gen_random_uuid(), :key, :module, :parent, :level, :name, :description, :sort, true
        WHERE EXISTS (SELECT 1 FROM feature_flags f WHERE f.key = :module)
          AND NOT EXISTS (SELECT 1 FROM module_features m WHERE m.key = :key)
    """)
    for key, module, parent, level, name, description, sort in ROWS:
        op.execute(insert.bindparams(key=key, module=module, parent=parent, level=level, name=name, description=description, sort=sort))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM module_features WHERE key IN :keys").bindparams(sa.bindparam("keys", tuple(r[0] for r in ROWS), expanding=True)))
    op.drop_index("ix_feature_activity_key_day", table_name="feature_activity")
    op.drop_table("feature_activity")
    op.drop_index("ix_feature_tenant_overrides_tenant_id", table_name="feature_tenant_overrides")
    op.drop_index("ix_feature_tenant_overrides_feature_key", table_name="feature_tenant_overrides")
    op.drop_table("feature_tenant_overrides")
    op.drop_column("feature_controls", "settings")
