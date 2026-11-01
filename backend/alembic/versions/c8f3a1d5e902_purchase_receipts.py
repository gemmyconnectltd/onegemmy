"""Persist partial goods receipts and purchase metadata.

Revision ID: c8f3a1d5e902
Revises: b7e2d9c4a118
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c8f3a1d5e902"
down_revision = "b7e2d9c4a118"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in [sa.Column("currency_code", sa.String(3)), sa.Column("base_amount", sa.Numeric(14, 2)), sa.Column("refund_base_amount", sa.Numeric(14, 2))]:
        op.add_column("purchase_returns", column)
    op.create_table("procurement_purchase_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purchase_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_orders.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False), sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(50), nullable=False), sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_procurement_purchase_attachments_tenant_id", "procurement_purchase_attachments", ["tenant_id"])
    op.create_index("ix_purchase_attachments_tenant_order", "procurement_purchase_attachments", ["tenant_id", "purchase_order_id"])
    op.add_column("purchase_items", sa.Column("is_service", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("purchase_items", sa.Column("expense_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounting_accounts.id")))
    op.add_column("purchase_items", sa.Column("tax_rate", sa.Numeric(5, 2)))
    op.add_column("purchase_items", sa.Column("stock_factor", sa.Numeric(14, 3)))
    op.add_column("procurement_supplier_bills", sa.Column("supplier_invoice_reference", sa.String(100)))
    op.create_index("uq_supplier_invoice_reference", "procurement_supplier_bills", ["tenant_id", "supplier_id", "supplier_invoice_reference"], unique=True)
    op.add_column("purchase_returns", sa.Column("client_reference", sa.String(50)))
    op.create_index("uq_purchase_returns_tenant_client", "purchase_returns", ["tenant_id", "client_reference"], unique=True)
    op.alter_column("purchase_returns", "quantity", type_=sa.Numeric(12, 3), existing_type=sa.Numeric(12, 2))
    op.add_column("purchase_items", sa.Column("received_quantity", sa.Numeric(12, 3), nullable=False, server_default="0"))
    op.execute("UPDATE purchase_items SET received_quantity = quantity FROM purchase_orders WHERE purchase_orders.id = purchase_items.purchase_order_id AND purchase_orders.status = 'Received'")
    for column in [sa.Column("order_date", sa.Date()), sa.Column("payment_terms_days", sa.Integer()),
                   sa.Column("supplier_reference", sa.String(100)), sa.Column("delivery_instructions", sa.Text()),
                   sa.Column("client_reference", sa.String(50)), sa.Column("request_fingerprint", sa.String(64))]:
        op.add_column("purchase_orders", column)
    op.create_index("uq_purchase_orders_tenant_client", "purchase_orders", ["tenant_id", "client_reference"], unique=True)
    op.create_index("ix_purchases_tenant_order_date", "purchase_orders", ["tenant_id", "order_date"])
    op.create_index("ix_purchases_tenant_supplier", "purchase_orders", ["tenant_id", "supplier_id"])
    op.create_table("procurement_goods_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reference", sa.String(50), nullable=False),
        sa.Column("client_reference", sa.String(50), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("purchase_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_orders.id"), nullable=False),
        sa.Column("branch_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("branches.id")),
        sa.Column("received_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False))
    op.create_index("ix_procurement_goods_receipts_tenant_id", "procurement_goods_receipts", ["tenant_id"])
    op.create_index("uq_goods_receipts_tenant_client", "procurement_goods_receipts", ["tenant_id", "client_reference"], unique=True)
    op.create_index("ix_goods_receipts_tenant_date", "procurement_goods_receipts", ["tenant_id", "received_at"])
    op.create_index("ix_goods_receipts_tenant_order", "procurement_goods_receipts", ["tenant_id", "purchase_order_id"])
    op.create_table("procurement_goods_receipt_lines",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("receipt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("procurement_goods_receipts.id"), nullable=False),
        sa.Column("purchase_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purchase_items.id"), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False))
    op.create_index("ix_receipt_lines_receipt", "procurement_goods_receipt_lines", ["receipt_id"])
    op.add_column("procurement_supplier_bills", sa.Column("receipt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("procurement_goods_receipts.id")))
    op.create_index("uq_supplier_bills_tenant_receipt", "procurement_supplier_bills", ["tenant_id", "receipt_id"], unique=True)


def downgrade() -> None:
    for name in ["currency_code", "base_amount", "refund_base_amount"]:
        op.drop_column("purchase_returns", name)
    op.drop_table("procurement_purchase_attachments")
    for name in ["is_service", "expense_account_id", "tax_rate", "stock_factor"]:
        op.drop_column("purchase_items", name)
    op.drop_index("uq_supplier_invoice_reference", table_name="procurement_supplier_bills")
    op.drop_column("procurement_supplier_bills", "supplier_invoice_reference")
    op.drop_index("uq_purchase_returns_tenant_client", table_name="purchase_returns")
    op.drop_column("purchase_returns", "client_reference")
    op.alter_column("purchase_returns", "quantity", type_=sa.Numeric(12, 2), existing_type=sa.Numeric(12, 3))
    op.drop_index("uq_supplier_bills_tenant_receipt", table_name="procurement_supplier_bills")
    op.drop_column("procurement_supplier_bills", "receipt_id")
    op.drop_table("procurement_goods_receipt_lines")
    op.drop_table("procurement_goods_receipts")
    op.drop_index("uq_purchase_orders_tenant_client", table_name="purchase_orders")
    op.drop_index("ix_purchases_tenant_order_date", table_name="purchase_orders")
    op.drop_index("ix_purchases_tenant_supplier", table_name="purchase_orders")
    for name in ["order_date", "payment_terms_days", "supplier_reference", "delivery_instructions", "client_reference", "request_fingerprint"]:
        op.drop_column("purchase_orders", name)
    op.drop_column("purchase_items", "received_quantity")
