"""Reset Business Data: stored exports and a one-business, one-transaction exception to the stock ledger's append-only rule.

Revision ID: b8e3f1a7c254
Revises: f2d7a4c1b963
"""
import sqlalchemy as sa

from alembic import op

revision = "b8e3f1a7c254"
down_revision = "f2d7a4c1b963"
branch_labels = None
depends_on = None

ORIGINAL = """
    CREATE OR REPLACE FUNCTION inventory_stock_movements_immutable() RETURNS trigger AS $$
    BEGIN
        IF TG_OP = 'DELETE' AND (NOT EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id) OR NOT EXISTS (SELECT 1 FROM inventory_products WHERE id = OLD.product_id)) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'The stock ledger is append-only: add a correcting movement instead';
    END; $$ LANGUAGE plpgsql;
"""
WITH_RESET = """
    CREATE OR REPLACE FUNCTION inventory_stock_movements_immutable() RETURNS trigger AS $$
    BEGIN
        IF TG_OP = 'DELETE' AND (NOT EXISTS (SELECT 1 FROM tenants WHERE id = OLD.tenant_id) OR NOT EXISTS (SELECT 1 FROM inventory_products WHERE id = OLD.product_id)) THEN RETURN OLD; END IF;
        -- Reset Business Data sets this for the length of its own transaction, naming the one business it is resetting.
        IF TG_OP = 'DELETE' AND current_setting('app.allow_ledger_reset', true) = OLD.tenant_id::text THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'The stock ledger is append-only: add a correcting movement instead';
    END; $$ LANGUAGE plpgsql;
"""


def upgrade() -> None:
    op.add_column("tenant_exports", sa.Column("file_path", sa.String(500), nullable=True))
    op.add_column("tenant_exports", sa.Column("file_sha256", sa.String(64), nullable=True))
    op.add_column("tenant_exports", sa.Column("file_bytes", sa.BigInteger(), nullable=True))
    op.execute(WITH_RESET)


def downgrade() -> None:
    op.execute(ORIGINAL)
    op.drop_column("tenant_exports", "file_bytes")
    op.drop_column("tenant_exports", "file_sha256")
    op.drop_column("tenant_exports", "file_path")
