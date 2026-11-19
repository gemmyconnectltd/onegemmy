"""Submodules and features inside modules, and per-business restrictions on them

Revision ID: e6a1c9f4b702
Revises: d5f9b3c7e214

Additive only. Two new tables; feature_flags, plans, subscriptions and every business's own switches are unchanged.
Every seeded row starts switched on and no business is restricted, so nothing anyone can do today changes.
Rows are seeded only under modules that exist. Rollback: `alembic downgrade d5f9b3c7e214` (drops both tables).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'e6a1c9f4b702'
down_revision: str | None = 'd5f9b3c7e214'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# key, module, parent, level, name, description, sort — a frozen copy of app.modules.tenants.feature_tree.TREE
ROWS = [
    ("inventory.stock_control", "inventory", None, "submodule", "Stock control", "Moving and counting stock", 10),
    ("inventory.transfers", "inventory", "inventory.stock_control", "feature", "Stock transfers", "Move stock between warehouses and branches", 11),
    ("inventory.stock_counts", "inventory", "inventory.stock_control", "feature", "Stock counts", "Count stock and post the differences", 12),
    ("inventory.traceability", "inventory", None, "submodule", "Traceability", "Follow individual units and lots", 20),
    ("inventory.batches", "inventory", "inventory.traceability", "feature", "Batch tracking", "Lots with expiry dates", 21),
    ("inventory.serials", "inventory", "inventory.traceability", "feature", "Serial numbers", "Track each unit by its serial number", 22),
    ("inventory.warranty", "inventory", "inventory.traceability", "feature", "Warranty", "Warranty records for sold units", 23),
    ("inventory.catalogue_extras", "inventory", None, "submodule", "Catalogue extras", "Optional product catalogue tools", 30),
    ("inventory.brands", "inventory", "inventory.catalogue_extras", "feature", "Brands", "Group products by brand", 31),
    ("inventory.markdowns", "inventory", "inventory.catalogue_extras", "feature", "Markdowns", "Reduce prices of slow or damaged stock", 32),
    ("sales.quotations", "sales", None, "feature", "Quotations", "Send quotations and convert them to sales", 10),
    ("sales.returns", "sales", None, "feature", "Sales returns", "Take back sold items and refund", 20),
    ("sales.targets", "sales", None, "feature", "Sales targets", "Targets for the team and each seller", 30),
    ("sales.deals", "sales", None, "feature", "Deals", "Track deals before they become sales", 40),
    ("procurement.requisitions", "procurement", None, "feature", "Purchase requests", "Staff request what should be bought", 10),
    ("procurement.supplier_bills", "procurement", None, "feature", "Supplier bills", "Record and pay supplier bills", 20),
    ("procurement.purchase_returns", "procurement", None, "feature", "Purchase returns", "Send goods back to suppliers", 30),
    ("accounting.budgets", "accounting", None, "feature", "Budgets", "Plan spending and compare it with actuals", 10),
    ("hr.attendance", "hr", None, "feature", "Attendance", "Clock-in records and timesheets", 10),
    ("hr.leave", "hr", None, "feature", "Leave", "Leave requests and balances", 20),
    ("hr.payroll", "hr", None, "feature", "Payroll", "Pay runs and payslips", 30),
    ("hr.recruitment", "hr", None, "feature", "Recruitment", "Applicants and hiring", 40),
    ("crm.campaigns", "crm", None, "feature", "Campaigns", "Customer campaigns and emails", 10),
]


def upgrade() -> None:
    op.create_table(
        "module_features",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(120), nullable=False),
        sa.Column("module_key", sa.String(100), sa.ForeignKey("feature_flags.key", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_key", sa.String(120), nullable=True),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("level IN ('submodule', 'feature')", name="ck_module_features_level"),
    )
    op.create_index("ix_module_features_key", "module_features", ["key"], unique=True)
    op.create_index("ix_module_features_module_key", "module_features", ["module_key"])
    op.create_index("ix_module_features_parent_key", "module_features", ["parent_key"])

    op.create_table(
        "tenant_feature_restrictions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("feature_key", sa.String(120), sa.ForeignKey("module_features.key", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.String(255), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "feature_key", name="uq_tenant_feature_restriction"),
    )
    op.create_index("ix_tenant_feature_restrictions_tenant_id", "tenant_feature_restrictions", ["tenant_id"])

    insert = sa.text("""
        INSERT INTO module_features (id, key, module_key, parent_key, level, name, description, sort_order, is_active)
        SELECT gen_random_uuid(), :key, :module, :parent, :level, :name, :description, :sort, true
        WHERE EXISTS (SELECT 1 FROM feature_flags f WHERE f.key = :module)
          AND NOT EXISTS (SELECT 1 FROM module_features m WHERE m.key = :key)
    """)
    for key, module, parent, level, name, description, sort in ROWS:
        op.execute(insert.bindparams(key=key, module=module, parent=parent, level=level, name=name,
                                     description=description, sort=sort))


def downgrade() -> None:
    op.drop_index("ix_tenant_feature_restrictions_tenant_id", table_name="tenant_feature_restrictions")
    op.drop_table("tenant_feature_restrictions")
    op.drop_index("ix_module_features_parent_key", table_name="module_features")
    op.drop_index("ix_module_features_module_key", table_name="module_features")
    op.drop_index("ix_module_features_key", table_name="module_features")
    op.drop_table("module_features")
