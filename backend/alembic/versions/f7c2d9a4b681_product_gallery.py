"""Product gallery: extra pictures of a product beside its main picture.

Revision ID: f7c2d9a4b681
Revises: e1b6c9d3a470
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "f7c2d9a4b681"
down_revision = "e1b6c9d3a470"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inventory_product_images",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("inventory_products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("url", sa.String(500), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_inventory_product_images_product", "inventory_product_images", ["product_id", "position"])
    op.create_index("ix_inventory_product_images_tenant_id", "inventory_product_images", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("inventory_product_images")
