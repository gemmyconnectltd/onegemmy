"""add_sales_module

Revision ID: a1b2c3d4e5f6
Revises: 7e5a5a2a6cbb
Create Date: 2025-08-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = ("7e5a5a2a6cbb", "d4d95d7e39c7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── sales_customers ──────────────────────────────────────────────────────
    op.create_table(
        "sales_customers",
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("customer_type", sa.String(20), nullable=False, server_default="individual"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_customers_tenant_id", "sales_customers", ["tenant_id"])
    op.create_index(
        "uq_sales_customers_tenant_email", "sales_customers", ["tenant_id", "email"],
        unique=True, postgresql_where=sa.text("email IS NOT NULL"),
    )

    # ── sales_deals ──────────────────────────────────────────────────────────
    op.create_table(
        "sales_deals",
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("value", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("stage", sa.String(50), nullable=False, server_default="Leads"),
        sa.Column("probability", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("expected_close_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("customer_id", sa.UUID(), nullable=True),
        sa.Column("owner_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["sales_customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_deals_tenant_id", "sales_deals", ["tenant_id"])
    op.create_index("ix_sales_deals_tenant_stage", "sales_deals", ["tenant_id", "stage"])
    op.create_index("ix_sales_deals_owner_id", "sales_deals", ["owner_id"])

    # ── sales_orders ─────────────────────────────────────────────────────────
    op.create_table(
        "sales_orders",
        sa.Column("order_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="Pending"),
        sa.Column("subtotal", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("discount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("tax", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("ordered_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("customer_id", sa.UUID(), nullable=True),
        sa.Column("deal_id", sa.UUID(), nullable=True),
        sa.Column("branch_id", sa.UUID(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["sales_customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deal_id"], ["sales_deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_sales_orders_tenant_number", "sales_orders", ["tenant_id", "order_number"], unique=True)
    op.create_index("ix_sales_orders_tenant_id", "sales_orders", ["tenant_id"])
    op.create_index("ix_sales_orders_customer_id", "sales_orders", ["customer_id"])
    op.create_index("ix_sales_orders_tenant_status", "sales_orders", ["tenant_id", "status"])

    # ── sales_order_items ────────────────────────────────────────────────────
    op.create_table(
        "sales_order_items",
        sa.Column("order_id", sa.UUID(), nullable=False),
        sa.Column("product_id", sa.UUID(), nullable=True),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("sku", sa.String(100), nullable=True),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("discount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["sales_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["inventory_products.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_order_items_order_id", "sales_order_items", ["order_id"])
    op.create_index("ix_sales_order_items_product_id", "sales_order_items", ["product_id"])

    # ── sales_returns ────────────────────────────────────────────────────────
    op.create_table(
        "sales_returns",
        sa.Column("return_number", sa.String(50), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("refund_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(20), nullable=False, server_default="Pending"),
        sa.Column("return_date", sa.Date(), nullable=False),
        sa.Column("order_id", sa.UUID(), nullable=True),
        sa.Column("customer_id", sa.UUID(), nullable=True),
        sa.Column("processed_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["sales_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["customer_id"], ["sales_customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["processed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("uq_sales_returns_tenant_number", "sales_returns", ["tenant_id", "return_number"], unique=True)
    op.create_index("ix_sales_returns_tenant_id", "sales_returns", ["tenant_id"])
    op.create_index("ix_sales_returns_order_id", "sales_returns", ["order_id"])
    op.create_index("ix_sales_returns_tenant_status", "sales_returns", ["tenant_id", "status"])

    # ── sales_return_items ───────────────────────────────────────────────────
    op.create_table(
        "sales_return_items",
        sa.Column("return_id", sa.UUID(), nullable=False),
        sa.Column("order_item_id", sa.UUID(), nullable=True),
        sa.Column("product_id", sa.UUID(), nullable=True),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("refund_per_unit", sa.Numeric(12, 2), nullable=False),
        sa.Column("line_refund", sa.Numeric(14, 2), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["return_id"], ["sales_returns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_item_id"], ["sales_order_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["product_id"], ["inventory_products.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_return_items_return_id", "sales_return_items", ["return_id"])

    # ── sales_targets ────────────────────────────────────────────────────────
    op.create_table(
        "sales_targets",
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("target_value", sa.Numeric(18, 2), nullable=False),
        sa.Column("achieved_value", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("unit", sa.String(20), nullable=False, server_default="number"),
        sa.Column("period", sa.String(50), nullable=False),
        sa.Column("assigned_to", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_targets_tenant_id", "sales_targets", ["tenant_id"])
    op.create_index("uq_sales_targets_tenant_name_period", "sales_targets", ["tenant_id", "name", "period"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_sales_targets_tenant_name_period", table_name="sales_targets")
    op.drop_index("ix_sales_targets_tenant_id", table_name="sales_targets")
    op.drop_table("sales_targets")

    op.drop_index("ix_sales_return_items_return_id", table_name="sales_return_items")
    op.drop_table("sales_return_items")

    op.drop_index("ix_sales_returns_tenant_status", table_name="sales_returns")
    op.drop_index("ix_sales_returns_order_id", table_name="sales_returns")
    op.drop_index("ix_sales_returns_tenant_id", table_name="sales_returns")
    op.drop_index("uq_sales_returns_tenant_number", table_name="sales_returns")
    op.drop_table("sales_returns")

    op.drop_index("ix_sales_order_items_product_id", table_name="sales_order_items")
    op.drop_index("ix_sales_order_items_order_id", table_name="sales_order_items")
    op.drop_table("sales_order_items")

    op.drop_index("ix_sales_orders_tenant_status", table_name="sales_orders")
    op.drop_index("ix_sales_orders_customer_id", table_name="sales_orders")
    op.drop_index("ix_sales_orders_tenant_id", table_name="sales_orders")
    op.drop_index("uq_sales_orders_tenant_number", table_name="sales_orders")
    op.drop_table("sales_orders")

    op.drop_index("ix_sales_deals_owner_id", table_name="sales_deals")
    op.drop_index("ix_sales_deals_tenant_stage", table_name="sales_deals")
    op.drop_index("ix_sales_deals_tenant_id", table_name="sales_deals")
    op.drop_table("sales_deals")

    op.drop_index("uq_sales_customers_tenant_email", table_name="sales_customers")
    op.drop_index("ix_sales_customers_tenant_id", table_name="sales_customers")
    op.drop_table("sales_customers")
