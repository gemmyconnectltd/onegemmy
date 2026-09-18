"""backfill default product images by industry

Revision ID: c33ee50223de
Revises: 9116f4ceb21c
Create Date: 2026-09-17 23:40:48.278510

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c33ee50223de'
down_revision: Union[str, None] = '9116f4ceb21c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mirrors app/modules/inventory/data/product_defaults.py at the time this
# migration was written — inlined (not imported) so this migration keeps
# doing the same thing even if that mapping changes later.
DEFAULT_PRODUCT_IMAGES = {
    "Retail": "/static/product-defaults/retail.svg",
    "Wholesale": "/static/product-defaults/wholesale.svg",
    "Manufacturing": "/static/product-defaults/manufacturing.svg",
    "Services": "/static/product-defaults/services.svg",
    "Hospitality": "/static/product-defaults/hospitality.svg",
    "Technology": "/static/product-defaults/technology.svg",
    "Agriculture": "/static/product-defaults/agriculture.svg",
    "Construction": "/static/product-defaults/construction.svg",
    "Healthcare": "/static/product-defaults/healthcare.svg",
    "Education": "/static/product-defaults/education.svg",
    "Other": "/static/product-defaults/other.svg",
}


def upgrade() -> None:
    conn = op.get_bind()

    for industry, image_path in DEFAULT_PRODUCT_IMAGES.items():
        if industry == "Other":
            continue
        conn.execute(
            sa.text("""
                UPDATE inventory_products
                SET image_url = :image_path
                FROM tenants
                WHERE inventory_products.tenant_id = tenants.id
                  AND inventory_products.image_url IS NULL
                  AND tenants.industry = :industry
            """),
            {"image_path": image_path, "industry": industry},
        )

    # Catch-all: products whose tenant has no industry set (or one outside
    # the known list) still shouldn't be left with a blank image.
    conn.execute(
        sa.text("""
            UPDATE inventory_products
            SET image_url = :image_path
            WHERE image_url IS NULL
        """),
        {"image_path": DEFAULT_PRODUCT_IMAGES["Other"]},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("""
            UPDATE inventory_products
            SET image_url = NULL
            WHERE image_url = ANY(:image_paths)
        """),
        {"image_paths": list(DEFAULT_PRODUCT_IMAGES.values())},
    )
