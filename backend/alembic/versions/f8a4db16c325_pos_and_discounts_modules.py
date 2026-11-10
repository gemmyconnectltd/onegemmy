"""Point of Sale and Discounts & Promotions become modules of their own

Revision ID: f8a4db16c325
Revises: e7f3ca05b214

Both used to ride on the "sales" flag. They get their own flags so a business can be sold, switched on and
restricted for each one separately. Nobody loses anything: a business Pesaa restricted from Sales, or whose
administrator switched Sales off, gets the same for the two new modules. Plan prices are frozen history and are not
edited: plans made before this change are read as covering POS and Discounts wherever they cover Sales
(see resolve_modules).
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f8a4db16c325'
down_revision: str | None = 'e7f3ca05b214'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW = ("pos", "discounts")


def upgrade() -> None:
    op.execute(sa.text("UPDATE feature_flags SET name = 'Sales', description = 'Sales orders, quotations, invoices, returns and customers' WHERE key = 'sales'"))
    op.execute(sa.text("""
        INSERT INTO feature_flags (id, key, name, module, description, default_enabled, is_active)
        SELECT gen_random_uuid(), v.key, v.name, v.key, v.description, true, true
        FROM (VALUES
            ('pos', 'Point of Sale', 'Tills, receipts, split payments and held sales'),
            ('discounts', 'Discounts & Promotions', 'Discount rules, promotions, coupons and approvals')
        ) AS v(key, name, description)
        WHERE NOT EXISTS (SELECT 1 FROM feature_flags f WHERE f.key = v.key)
    """))
    for key in NEW:  # a business Pesaa restricted from Sales stays restricted from what used to be part of it
        op.execute(sa.text("""
            UPDATE tenants SET features = features || jsonb_build_object(CAST(:k AS text), features->'sales')
            WHERE jsonb_exists(features, 'sales') AND NOT jsonb_exists(features, CAST(:k AS text))
        """).bindparams(k=key))
    for key in NEW:  # a business administrator who switched Sales off had switched these off with it
        op.execute(sa.text("""
            UPDATE tenants SET module_activation = module_activation || jsonb_build_object(CAST(:k AS text), module_activation->'sales')
            WHERE jsonb_exists(module_activation, 'sales') AND NOT jsonb_exists(module_activation, CAST(:k AS text))
        """).bindparams(k=key))


def downgrade() -> None:
    op.execute(sa.text("UPDATE tenants SET features = features - 'pos' - 'discounts', module_activation = module_activation - 'pos' - 'discounts'"))
    op.execute(sa.text("DELETE FROM feature_flags WHERE key IN ('pos', 'discounts')"))
    op.execute(sa.text("UPDATE feature_flags SET name = 'Sales & POS', description = 'Sales orders, receipts and point of sale' WHERE key = 'sales'"))
