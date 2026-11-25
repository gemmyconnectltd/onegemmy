"""Accounts get a profit-and-loss section (sales / other income; cost of goods sold / operating / other expense)

Revision ID: d8e4b1c6a3f7
Revises: c7d3a9e5f210

Adds accounting_accounts.pnl_section (nullable). Every report uses it through service/pnl_sections.py; an account without one
falls back to its code range, exactly as reports worked before, so no figure changes until someone classifies an account.
Only untouched default accounts (the seeded code AND the seeded name) are labelled here, with the section their code range
already gave them. Custom accounts are never classified by name. No journal changes.
Rollback: `alembic downgrade c7d3a9e5f210` drops the column.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d8e4b1c6a3f7"
down_revision: str | None = "c7d3a9e5f210"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (code, seeded name, section) for the default Revenue and Expense accounts.
DEFAULTS = [
    ("4000", "Sales Revenue", "sales"), ("4100", "Service Revenue", "sales"),
    ("4900", "Foreign Exchange Gain", "other_income"), ("4910", "Other Income", "other_income"), ("4950", "Asset Disposal Gain", "other_income"),
    ("5000", "Cost of Goods Sold", "cogs"),
    ("5100", "Rent Expense", "operating"), ("5200", "Utilities Expense", "operating"), ("5300", "Salaries Expense", "operating"),
    ("5400", "Supplies Expense", "operating"), ("5500", "Depreciation Expense", "operating"), ("5600", "Bad Debt Expense", "operating"),
    ("5700", "General Expenses", "operating"), ("5800", "Inventory Adjustment", "operating"),
    ("5900", "Other Expense", "other_expense"), ("5950", "Foreign Exchange Loss", "other_expense"), ("5960", "Asset Disposal Loss", "other_expense"),
]


def upgrade() -> None:
    op.add_column("accounting_accounts", sa.Column("pnl_section", sa.String(20), nullable=True))
    for code, name, section in DEFAULTS:
        op.execute(sa.text("UPDATE accounting_accounts SET pnl_section = :section WHERE code = :code AND name = :name AND pnl_section IS NULL")
                   .bindparams(section=section, code=code, name=name))


def downgrade() -> None:
    op.drop_column("accounting_accounts", "pnl_section")
