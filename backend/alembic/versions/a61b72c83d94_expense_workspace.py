"""Add expense classification, private receipt metadata and branch/payment context."""

import sqlalchemy as sa

from alembic import op

revision = "a61b72c83d94"
down_revision = "f50d318a9b72"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounting_expense_categories",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("description", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "uq_expense_categories_tenant_name",
        "accounting_expense_categories",
        ["tenant_id", "name"],
        unique=True,
    )
    for name, target in [("branch_id", "branches"), ("supplier_id", "inventory_suppliers")]:
        op.add_column(
            "accounting_expenses",
            sa.Column(name, sa.UUID(), sa.ForeignKey(f"{target}.id", ondelete="SET NULL")),
        )
    for name, length in [
        ("reference_number", 100),
        ("client_reference", 50),
        ("receipt_key", 100),
        ("receipt_name", 255),
        ("receipt_type", 50),
    ]:
        op.add_column("accounting_expenses", sa.Column(name, sa.String(length)))
    op.add_column(
        "accounting_expenses",
        sa.Column("payment_method", sa.String(20), nullable=False, server_default="Cash"),
    )
    for suffix, columns in [
        ("date", ["expense_date"]),
        ("branch_date", ["branch_id", "expense_date"]),
        ("category_date", ["category", "expense_date"]),
        ("method_date", ["payment_method", "expense_date"]),
    ]:
        op.create_index(
            f"ix_expenses_tenant_{suffix}", "accounting_expenses", ["tenant_id", *columns]
        )
    op.create_index(
        "uq_expenses_tenant_client",
        "accounting_expenses",
        ["tenant_id", "client_reference"],
        unique=True,
    )
    op.execute("""INSERT INTO accounting_expense_categories (id, tenant_id, name)
        SELECT md5(tenant_id::text || ':' || category)::uuid, tenant_id, category
        FROM accounting_expenses GROUP BY tenant_id, category""")
    op.execute("""INSERT INTO permissions (id, name, resource, action)
        SELECT md5('expenses:' || a)::uuid, 'expenses:' || a, 'expenses', a
        FROM unnest(ARRAY['read','create','update','delete']) a ON CONFLICT (name) DO NOTHING""")
    op.execute("""INSERT INTO role_permissions (role_id, permission_id)
        SELECT rp.role_id, ep.id FROM role_permissions rp
        JOIN permissions bp ON bp.id = rp.permission_id AND bp.resource = 'budgeting'
        JOIN permissions ep ON ep.resource = 'expenses' AND ep.action = bp.action
        ON CONFLICT DO NOTHING""")


def downgrade() -> None:
    op.execute("DELETE FROM permissions WHERE resource = 'expenses'")
    op.drop_index("uq_expenses_tenant_client", table_name="accounting_expenses")
    for suffix in ["date", "branch_date", "category_date", "method_date"]:
        op.drop_index(f"ix_expenses_tenant_{suffix}", table_name="accounting_expenses")
    for name in [
        "branch_id",
        "supplier_id",
        "reference_number",
        "client_reference",
        "receipt_key",
        "receipt_name",
        "receipt_type",
        "payment_method",
    ]:
        op.drop_column("accounting_expenses", name)
    op.drop_table("accounting_expense_categories")
