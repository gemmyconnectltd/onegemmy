"""rename finance module to accounting

Revision ID: a54473250090
Revises: b1dddaf8dc93
Create Date: 2026-09-01 16:08:54.749798

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'a54473250090'
down_revision: str | None = 'b1dddaf8dc93'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = [
    "finance_accounts",
    "finance_budgets",
    "finance_expenses",
    "finance_tax_configs",
    "finance_tax_calculations",
    "finance_tax_payments",
    "finance_transaction_lines",
    "finance_transactions",
]


def upgrade() -> None:
    for old_name in TABLES:
        new_name = old_name.replace("finance_", "accounting_", 1)
        op.rename_table(old_name, new_name)

    op.execute(sa.text("""
        UPDATE feature_flags
        SET key = 'accounting', name = 'Accounting', module = 'accounting'
        WHERE key = 'finance'
    """))
    op.execute(sa.text("""
        UPDATE tenants
        SET features = (features - 'finance') || jsonb_build_object('accounting', features -> 'finance')
        WHERE features ? 'finance'
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        UPDATE tenants
        SET features = (features - 'accounting') || jsonb_build_object('finance', features -> 'accounting')
        WHERE features ? 'accounting'
    """))
    op.execute(sa.text("""
        UPDATE feature_flags
        SET key = 'finance', name = 'Finance & Accounting', module = 'finance'
        WHERE key = 'accounting'
    """))

    for old_name in TABLES:
        new_name = old_name.replace("finance_", "accounting_", 1)
        op.rename_table(new_name, old_name)
