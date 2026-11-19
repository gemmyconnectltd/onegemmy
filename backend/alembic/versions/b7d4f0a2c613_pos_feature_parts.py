"""Point of Sale parts: payment methods (cash, mobile money, card) and manual discounts

Revision ID: b7d4f0a2c613
Revises: a3c8e5f1d907

Till sales all go to POST /sales/orders, so these parts are recognised from the sale itself (pricing_channel "pos",
its payment method and any manual discount). Additive: five rows, switched on, only where the POS module exists.
Rollback: `alembic downgrade a3c8e5f1d907`.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'b7d4f0a2c613'
down_revision: str | None = 'a3c8e5f1d907'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# key, module, parent, level, name, description, sort — a frozen copy of the matching rows in feature_tree.TREE
ROWS = [
    ("pos.payments", "pos", None, "submodule", "Payment methods", "How customers can pay at the till", 10),
    ("pos.cash", "pos", "pos.payments", "feature", "Cash", "Take cash at the till", 11),
    ("pos.mobile_money", "pos", "pos.payments", "feature", "Mobile Money", "Take mobile money at the till", 12),
    ("pos.card", "pos", "pos.payments", "feature", "Card", "Take card payments at the till", 13),
    ("pos.manual_discounts", "pos", None, "feature", "Manual discounts", "Discounts the cashier types in at the till", 20),
]


def upgrade() -> None:
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
