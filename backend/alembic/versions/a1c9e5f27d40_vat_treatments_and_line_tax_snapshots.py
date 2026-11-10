"""VAT treatments on products, business VAT registration details, and per-line tax snapshots

Revision ID: a1c9e5f27d40
Revises: f8a4db16c325

Additive only: every new column is nullable or has a default, nothing existing is rewritten.
- Products: vat_treatment stays NULL ("Not reviewed") until someone classifies the product. A NULL product is priced
  as standard-rated, exactly as every product was before this change. Nothing is guessed from names or categories.
- Lines: tax snapshot columns stay NULL on every document created before this change. Those documents keep their
  order-level tax figures, which remain the source of truth for them (reports fall back to them).
Rollback: `alembic downgrade f8a4db16c325` drops only the columns added here.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'a1c9e5f27d40'
down_revision: str | None = 'f8a4db16c325'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SNAPSHOT_TABLES = ("sales_order_items", "sales_quotation_items")


def upgrade() -> None:
    op.add_column("inventory_products", sa.Column("vat_treatment", sa.String(20), nullable=True))
    op.add_column("inventory_products", sa.Column("tax_code", sa.String(30), nullable=True))
    op.add_column("inventory_products", sa.Column("vat_reason", sa.String(255), nullable=True))
    op.add_column("inventory_products", sa.Column("vat_reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("inventory_products", sa.Column("vat_reviewed_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_check_constraint("ck_inventory_products_vat_treatment", "inventory_products",
                               "vat_treatment IS NULL OR vat_treatment IN ('standard','zero_rated','exempt','out_of_scope')")
    op.create_index("ix_inventory_products_tenant_vat", "inventory_products", ["tenant_id", "vat_treatment"])

    op.add_column("inventory_product_variants", sa.Column("vat_treatment", sa.String(20), nullable=True))  # NULL = same as the product
    op.create_check_constraint("ck_inventory_product_variants_vat_treatment", "inventory_product_variants",
                               "vat_treatment IS NULL OR vat_treatment IN ('standard','zero_rated','exempt','out_of_scope')")

    op.add_column("tenants", sa.Column("vat_number", sa.String(50), nullable=True))
    op.add_column("tenants", sa.Column("vat_registered_from", sa.Date(), nullable=True))
    op.add_column("tenants", sa.Column("vat_pricing_mode", sa.String(10), nullable=False, server_default="inclusive"))
    op.create_check_constraint("ck_tenants_vat_pricing_mode", "tenants", "vat_pricing_mode IN ('inclusive','exclusive')")

    for table in SNAPSHOT_TABLES:
        op.add_column(table, sa.Column("tax_treatment", sa.String(20), nullable=True))
        op.add_column(table, sa.Column("tax_code", sa.String(30), nullable=True))
        op.add_column(table, sa.Column("tax_rate", sa.Numeric(7, 4), nullable=True))
        op.add_column(table, sa.Column("taxable_base", sa.Numeric(14, 2), nullable=True))
        op.add_column(table, sa.Column("tax_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("sales_return_items", sa.Column("tax_treatment", sa.String(20), nullable=True))
    op.add_column("sales_return_items", sa.Column("tax_rate", sa.Numeric(7, 4), nullable=True))
    op.add_column("sales_return_items", sa.Column("tax_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("purchase_items", sa.Column("tax_treatment", sa.String(20), nullable=True))
    op.add_column("purchase_items", sa.Column("tax_amount", sa.Numeric(14, 2), nullable=True))
    op.add_column("purchase_items", sa.Column("vat_recoverable", sa.Boolean(), nullable=True))


def downgrade() -> None:
    for col in ("vat_recoverable", "tax_amount", "tax_treatment"):
        op.drop_column("purchase_items", col)
    for col in ("tax_amount", "tax_rate", "tax_treatment"):
        op.drop_column("sales_return_items", col)
    for table in SNAPSHOT_TABLES:
        for col in ("tax_amount", "taxable_base", "tax_rate", "tax_code", "tax_treatment"):
            op.drop_column(table, col)
    op.drop_constraint("ck_tenants_vat_pricing_mode", "tenants", type_="check")
    for col in ("vat_pricing_mode", "vat_registered_from", "vat_number"):
        op.drop_column("tenants", col)
    op.drop_constraint("ck_inventory_product_variants_vat_treatment", "inventory_product_variants", type_="check")
    op.drop_column("inventory_product_variants", "vat_treatment")
    op.drop_index("ix_inventory_products_tenant_vat", table_name="inventory_products")
    op.drop_constraint("ck_inventory_products_vat_treatment", "inventory_products", type_="check")
    for col in ("vat_reviewed_by", "vat_reviewed_at", "vat_reason", "tax_code", "vat_treatment"):
        op.drop_column("inventory_products", col)
