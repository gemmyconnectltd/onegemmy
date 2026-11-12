"""Expense categories carry their ledger account

Revision ID: d5f9b3c7e214
Revises: c4e8a2b6d913

Additive: account_id stays NULL on every existing category; approval then falls back to the built-in
account for that category name, or to 5700 General Expenses. Rollback: `alembic downgrade c4e8a2b6d913`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'd5f9b3c7e214'
down_revision: str | None = 'c4e8a2b6d913'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("accounting_expense_categories", sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_expense_categories_account", "accounting_expense_categories", "accounting_accounts",
                          ["account_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_expense_categories_account", "accounting_expense_categories", type_="foreignkey")
    op.drop_column("accounting_expense_categories", "account_id")
