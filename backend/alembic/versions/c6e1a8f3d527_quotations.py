"""Quotations: offers to customers with line items, a lifecycle and a one-time conversion into a sale.

Revision ID: c6e1a8f3d527
Revises: b2f7c4d9a815
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "c6e1a8f3d527"
down_revision = "b2f7c4d9a815"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_quotations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quote_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="Draft"),
        sa.Column("customer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sales_customers.id", ondelete="SET NULL")),
        sa.Column("salesperson_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("expiry_date", sa.Date()),
        sa.Column("subtotal", sa.Numeric(14, 2), server_default="0"),
        sa.Column("discount", sa.Numeric(14, 2), server_default="0"),
        sa.Column("tax", sa.Numeric(14, 2), server_default="0"),
        sa.Column("total", sa.Numeric(14, 2), server_default="0"),
        sa.Column("notes", sa.Text()),
        sa.Column("terms", sa.Text()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("decision_reason", sa.Text()),
        sa.Column("converted_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sales_orders.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("uq_sales_quotations_tenant_number", "sales_quotations", ["tenant_id", "quote_number"], unique=True)
    op.create_index("uq_sales_quotations_converted_order", "sales_quotations", ["converted_order_id"], unique=True)
    op.create_index("ix_sales_quotations_tenant_status", "sales_quotations", ["tenant_id", "status"])
    op.create_index("ix_sales_quotations_tenant_salesperson", "sales_quotations", ["tenant_id", "salesperson_id"])
    op.create_table(
        "sales_quotation_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("quotation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0"),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inventory_products.id", ondelete="SET NULL")),
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inventory_product_variants.id", ondelete="SET NULL")),
        sa.Column("product_name", sa.String(255), nullable=False),
        sa.Column("sku", sa.String(100)),
        sa.Column("variant_attributes", postgresql.JSON()),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False, server_default="1"),
        sa.Column("discount", sa.Numeric(12, 2), server_default="0"),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
    )
    op.create_index("ix_sales_quotation_items_quotation", "sales_quotation_items", ["quotation_id"])


def downgrade() -> None:
    op.drop_table("sales_quotation_items")
    op.drop_table("sales_quotations")
