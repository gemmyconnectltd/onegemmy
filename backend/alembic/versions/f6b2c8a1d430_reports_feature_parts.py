"""Business reports tabs become switchable features

Revision ID: f6b2c8a1d430
Revises: c4e9a1d7b350

Every tab in Business reports gets its own part under the Reports module, so Pesaa can switch one off for all
businesses or restrict it for one, and the ERP hides the tab. Reports are read-only; none of this touches records.
Rollback: `alembic downgrade c4e9a1d7b350`.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f6b2c8a1d430'
down_revision: str | None = 'c4e9a1d7b350'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# key, module, parent, level, name, description, sort — a frozen copy of the matching rows in feature_tree.TREE.
ROWS = [
    ("reports.overview", "reports", None, "feature", "Overview", "Business-wide performance for the chosen period", 10),
    ("reports.daily", "reports", None, "feature", "Daily report", "Each branch's day: sales, stock, debt, expense and deposits", 20),
    ("reports.team", "reports", None, "feature", "Team performance", "Sales per salesperson", 30),
    ("reports.sales", "reports", None, "feature", "Sales report", "Sales broken down by product, customer and branch", 40),
    ("reports.finance", "reports", None, "feature", "Finance report", "Income, expenses and cash position", 50),
    ("reports.stock", "reports", None, "feature", "Stock report", "Stock valuation and movements", 60),
    ("reports.purchases", "reports", None, "feature", "Purchases report", "Supplier spend and purchase orders", 70),
    ("reports.customers", "reports", None, "feature", "Customers report", "Customer buying and new customers", 80),
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
