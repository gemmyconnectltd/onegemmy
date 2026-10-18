"""Separate readable journal numbers from client retry keys."""
import sqlalchemy as sa

from alembic import op

revision = "e49c207f8a61"
down_revision = "d74b019e2c86"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("accounting_journal_sequences",
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("last_number", sa.Integer(), nullable=False))
    op.add_column("accounting_transactions", sa.Column("client_reference", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("accounting_transactions", "client_reference")
    op.drop_table("accounting_journal_sequences")
