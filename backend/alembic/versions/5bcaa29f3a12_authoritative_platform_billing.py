"""authoritative platform billing

Revision ID: 5bcaa29f3a12
Revises: d7e2b9c41a55
Create Date: 2026-10-18 15:20:08.495446

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "5bcaa29f3a12"
down_revision: str | None = "d7e2b9c41a55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("billing_required", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.execute("CREATE SEQUENCE billing_invoice_number_seq")
    op.create_table(
        "billing_operations",
        sa.Column("scope", sa.String(length=120), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope", "key"),
    )
    op.create_table(
        "billing_plans",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("status IN ('draft','active','archived')"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_billing_plans_status"), "billing_plans", ["status"], unique=False)
    op.create_table(
        "billing_reports",
        sa.Column("key", sa.String(length=180), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "billing_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "billing_notices",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("event_key", sa.String(length=180), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body", sa.String(length=2000), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_key"),
    )
    op.create_index(
        op.f("ix_billing_notices_available_at"), "billing_notices", ["available_at"], unique=False
    )
    op.create_table(
        "billing_prices",
        sa.Column("plan_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("terms", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["billing_plans.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plan_id", "version", "currency"),
    )
    op.create_table(
        "billing_subscriptions",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("plan_id", sa.UUID(), nullable=False),
        sa.Column("price_id", sa.UUID(), nullable=False),
        sa.Column("cycle", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("terms", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("seats", sa.Integer(), nullable=False),
        sa.Column("branches", sa.Integer(), nullable=False),
        sa.Column("recurring", sa.BigInteger(), nullable=False),
        sa.Column("recurring_net", sa.BigInteger(), nullable=False),
        sa.Column("credit", sa.BigInteger(), nullable=False),
        sa.Column("discount_bps", sa.Integer(), nullable=False),
        sa.Column("next_discount_bps", sa.Integer(), nullable=True),
        sa.Column("billing_anchor_day", sa.Integer(), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("trial_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_at_end", sa.Boolean(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("cycle IN ('monthly','annual')"),
        sa.CheckConstraint("discount_bps BETWEEN 0 AND 10000"),
        sa.CheckConstraint("recurring >= 0 AND seats >= 0 AND branches >= 0"),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["billing_plans.id"],
        ),
        sa.ForeignKeyConstraint(
            ["price_id"],
            ["billing_prices.id"],
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id"),
    )
    op.create_index(
        "ix_billing_sub_status_plan_currency",
        "billing_subscriptions",
        ["status", "plan_id", "currency"],
        unique=False,
    )
    op.create_index(
        op.f("ix_billing_subscriptions_period_end"),
        "billing_subscriptions",
        ["period_end"],
        unique=False,
    )
    op.create_table(
        "billing_invoices",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("subscription_id", sa.UUID(), nullable=False),
        sa.Column("bill_to", sa.String(255), nullable=False),
        sa.Column("currency_decimals", sa.Integer(), nullable=False),
        sa.Column("number", sa.String(length=60), nullable=False),
        sa.Column("source_key", sa.String(length=150), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("lines", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("subtotal", sa.BigInteger(), nullable=False),
        sa.Column("tax", sa.BigInteger(), nullable=False),
        sa.Column("total", sa.BigInteger(), nullable=False),
        sa.Column("paid", sa.BigInteger(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("total >= 0 AND paid >= 0 AND paid <= total AND tax >= 0"),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["billing_subscriptions.id"],
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("number"),
        sa.UniqueConstraint("source_key"),
    )
    op.create_index(
        "ix_billing_inv_tenant_created",
        "billing_invoices",
        ["tenant_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_billing_inv_tenant_status",
        "billing_invoices",
        ["tenant_id", "status", "due_at"],
        unique=False,
    )
    op.create_table(
        "billing_quotes",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("request", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("preview", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_billing_quote_tenant_created",
        "billing_quotes",
        ["tenant_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "billing_payments",
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("reference", sa.UUID(), nullable=False),
        sa.Column("provider_ref", sa.String(length=150), nullable=True),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("method", sa.String(length=60), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("provider_payload", sa.Text(), nullable=True),
        sa.Column("failure_reason", sa.String(length=200), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0"),
        sa.ForeignKeyConstraint(
            ["invoice_id"],
            ["billing_invoices.id"],
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider_ref"),
        sa.UniqueConstraint("reference"),
    )
    op.create_index(
        "ix_billing_pay_status_created", "billing_payments", ["status", "created_at"], unique=False
    )
    op.create_index(
        "ix_billing_pay_tenant_created",
        "billing_payments",
        ["tenant_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "billing_daily",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("currency", sa.String(3), primary_key=True),
        sa.Column("plan_id", sa.UUID(), primary_key=True),
        sa.Column("subscription_status", sa.String(20), primary_key=True),
        sa.Column("invoice_count", sa.BigInteger(), nullable=False),
        sa.Column("outstanding", sa.BigInteger(), nullable=False),
        sa.Column("successful_payments", sa.BigInteger(), nullable=False),
        sa.Column("failed_payments", sa.BigInteger(), nullable=False),
        sa.Column("successful_amount", sa.BigInteger(), nullable=False),
    )
    op.create_table(
        "billing_refunds",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("payment_id", sa.UUID(), sa.ForeignKey("billing_payments.id"), nullable=False),
        sa.Column("reference", sa.UUID(), nullable=False, unique=True),
        sa.Column("number", sa.String(60), nullable=False, unique=True),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("document", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0"),
    )
    op.create_index(
        "ix_billing_refund_tenant_created", "billing_refunds", ["tenant_id", "created_at"]
    )
    op.create_index("ix_billing_refund_payment_status", "billing_refunds", ["payment_id", "status"])
    # Tenant identity is enforced even if an internal caller supplies inconsistent IDs.
    op.create_unique_constraint("uq_billing_price_plan_id", "billing_prices", ["plan_id", "id"])
    op.create_unique_constraint(
        "uq_billing_sub_tenant_id", "billing_subscriptions", ["tenant_id", "id"]
    )
    op.create_unique_constraint(
        "uq_billing_invoice_tenant_id", "billing_invoices", ["tenant_id", "id"]
    )
    op.create_unique_constraint(
        "uq_billing_payment_tenant_id", "billing_payments", ["tenant_id", "id"]
    )
    op.create_foreign_key(
        "fk_billing_sub_price_plan",
        "billing_subscriptions",
        "billing_prices",
        ["plan_id", "price_id"],
        ["plan_id", "id"],
    )
    op.create_foreign_key(
        "fk_billing_invoice_tenant_sub",
        "billing_invoices",
        "billing_subscriptions",
        ["tenant_id", "subscription_id"],
        ["tenant_id", "id"],
    )
    op.create_foreign_key(
        "fk_billing_payment_tenant_invoice",
        "billing_payments",
        "billing_invoices",
        ["tenant_id", "invoice_id"],
        ["tenant_id", "id"],
    )
    op.create_foreign_key(
        "fk_billing_refund_tenant_payment",
        "billing_refunds",
        "billing_payments",
        ["tenant_id", "payment_id"],
        ["tenant_id", "id"],
    )
    op.create_index(
        "ix_billing_pay_tenant_invoice",
        "billing_payments",
        ["tenant_id", "invoice_id", "created_at"],
    )
    # Freeze finalized financial identities and amounts; only balances/status may evolve.
    op.execute("""
        CREATE FUNCTION billing_immutable_document() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Billing financial history cannot be deleted';
          END IF;
          IF TG_TABLE_NAME = 'billing_prices' OR
             TG_TABLE_NAME = 'billing_operations' OR
             (TG_TABLE_NAME = 'billing_refunds' AND
              (to_jsonb(NEW) - ARRAY['status','updated_at']) IS DISTINCT FROM
              (to_jsonb(OLD) - ARRAY['status','updated_at'])) OR
             (TG_TABLE_NAME = 'billing_invoices' AND
              (to_jsonb(NEW) - ARRAY['paid','status','updated_at']) IS DISTINCT FROM
              (to_jsonb(OLD) - ARRAY['paid','status','updated_at'])) OR
             (TG_TABLE_NAME = 'billing_payments' AND
              (to_jsonb(NEW) - ARRAY['status','failure_reason','provider_ref','provider_payload','updated_at'])
              IS DISTINCT FROM
              (to_jsonb(OLD) - ARRAY['status','failure_reason','provider_ref','provider_payload','updated_at'])) THEN
            RAISE EXCEPTION 'Billing financial identities and amounts are immutable';
          END IF;
          IF TG_TABLE_NAME = 'billing_invoices' THEN
            IF NEW.paid < OLD.paid THEN RAISE EXCEPTION 'Settled payments cannot be removed'; END IF;
          END IF;
          IF TG_TABLE_NAME = 'billing_payments' THEN
            IF OLD.status = 'succeeded' AND NEW.status <> OLD.status THEN
              RAISE EXCEPTION 'Verified payments cannot be rewritten';
            END IF;
          END IF;
          RETURN NEW;
        END $$;
    """)
    for table in (
        "billing_prices",
        "billing_invoices",
        "billing_payments",
        "billing_operations",
        "billing_refunds",
    ):
        op.execute(
            f"CREATE TRIGGER billing_immutable BEFORE UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION billing_immutable_document()"
        )
    # Existing tenant Admin roles receive explicit billing access; Member/Viewer do not.
    for action in ("read", "update"):
        op.execute(
            sa.text("""
            INSERT INTO permissions (id, name, resource, action, description)
            VALUES (:id, :name, 'billing', :action, :description)
            ON CONFLICT (name) DO NOTHING
        """).bindparams(
                id=__import__("uuid").uuid4(),
                name=f"billing:{action}",
                action=action,
                description=f"{action.title()} company billing",
            )
        )
    op.execute("""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
        WHERE r.name = 'Admin' AND p.name IN ('billing:read','billing:update')
        ON CONFLICT DO NOTHING
    """)
    # ### end Alembic commands ###


def downgrade() -> None:
    op.drop_column("tenants", "billing_required")
    op.drop_table("billing_daily")
    op.drop_table("billing_refunds")
    op.drop_index("ix_billing_pay_tenant_created", table_name="billing_payments")
    op.drop_index("ix_billing_pay_status_created", table_name="billing_payments")
    op.drop_table("billing_payments")
    op.drop_index("ix_billing_quote_tenant_created", table_name="billing_quotes")
    op.drop_table("billing_quotes")
    op.drop_index("ix_billing_inv_tenant_status", table_name="billing_invoices")
    op.drop_index("ix_billing_inv_tenant_created", table_name="billing_invoices")
    op.drop_table("billing_invoices")
    op.drop_index(op.f("ix_billing_subscriptions_period_end"), table_name="billing_subscriptions")
    op.drop_index("ix_billing_sub_status_plan_currency", table_name="billing_subscriptions")
    op.drop_table("billing_subscriptions")
    op.drop_table("billing_prices")
    op.drop_index(op.f("ix_billing_notices_available_at"), table_name="billing_notices")
    op.drop_table("billing_notices")
    op.drop_table("billing_settings")
    op.drop_table("billing_reports")
    op.drop_index(op.f("ix_billing_plans_status"), table_name="billing_plans")
    op.drop_table("billing_plans")
    op.drop_table("billing_operations")
    op.execute("DROP SEQUENCE billing_invoice_number_seq")
    op.execute("DROP FUNCTION billing_immutable_document()")
    # ### end Alembic commands ###
