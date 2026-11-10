"""Discount rules, promotion campaigns, coupons, applied-discount history, tenant discount settings and the discount permissions.

Revision ID: c5d1a8e2f973
Revises: b8e3f1a7c254
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "c5d1a8e2f973"
down_revision = "b8e3f1a7c254"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _id():
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _tenant():
    return sa.Column(
        "tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )


def _stamps():
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("discount_settings", postgresql.JSONB(), server_default="{}", nullable=False),
    )
    op.create_table(
        "discount_campaigns",
        _id(),
        _tenant(),
        *_stamps(),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(12), nullable=False, server_default="Draft"),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("branch_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("target", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("usage_limit", sa.Integer()),
        sa.Column("budget", sa.Numeric(14, 2)),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_index("ix_discount_campaigns_tenant_id", "discount_campaigns", ["tenant_id"])
    op.execute(
        "CREATE UNIQUE INDEX uq_discount_campaigns_code ON discount_campaigns (tenant_id, lower(code))"
    )
    op.create_table(
        "discount_rules",
        _id(),
        _tenant(),
        *_stamps(),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("type", sa.String(12), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="Draft"),
        sa.Column("value_kind", sa.String(8), nullable=False, server_default="percent"),
        sa.Column("value", sa.Numeric(14, 4), nullable=False, server_default="0"),
        sa.Column("max_discount", sa.Numeric(14, 2)),
        sa.Column("config", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("combinable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("exclusive", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("max_combined_pct", sa.Numeric(6, 2)),
        sa.Column("campaign_id", UUID, sa.ForeignKey("discount_campaigns.id", ondelete="SET NULL")),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("activated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_discount_rules_tenant_id", "discount_rules", ["tenant_id"])
    op.create_index("ix_discount_rules_status", "discount_rules", ["tenant_id", "status"])
    op.execute(
        "CREATE UNIQUE INDEX uq_discount_rules_code ON discount_rules (tenant_id, lower(code))"
    )
    op.create_table(
        "discount_coupons",
        _id(),
        _tenant(),
        *_stamps(),
        sa.Column(
            "rule_id", UUID, sa.ForeignKey("discount_rules.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="Active"),
        sa.Column("max_redemptions", sa.Integer()),
        sa.Column("per_customer_limit", sa.Integer()),
        sa.Column("redeemed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("customer_id", UUID, sa.ForeignKey("sales_customers.id", ondelete="SET NULL")),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
    )
    op.create_index("ix_discount_coupons_tenant_id", "discount_coupons", ["tenant_id"])
    op.execute(
        "CREATE UNIQUE INDEX uq_discount_coupons_code ON discount_coupons (tenant_id, upper(code))"
    )
    op.create_table(
        "discount_coupon_redemptions",
        _id(),
        _tenant(),
        sa.Column(
            "coupon_id",
            UUID,
            sa.ForeignKey("discount_coupons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "order_id", UUID, sa.ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("customer_id", UUID, sa.ForeignKey("sales_customers.id", ondelete="SET NULL")),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("released", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_discount_coupon_redemptions_tenant_id", "discount_coupon_redemptions", ["tenant_id"]
    )
    op.create_index(
        "uq_discount_redemptions_order",
        "discount_coupon_redemptions",
        ["coupon_id", "order_id"],
        unique=True,
    )
    op.create_table(
        "discount_applied",
        _id(),
        _tenant(),
        sa.Column(
            "order_id", UUID, sa.ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("rule_id", UUID, sa.ForeignKey("discount_rules.id", ondelete="SET NULL")),
        sa.Column("campaign_id", UUID, sa.ForeignKey("discount_campaigns.id", ondelete="SET NULL")),
        sa.Column("rule_name", sa.String(150), nullable=False),
        sa.Column("rule_type", sa.String(12), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("coupon_code", sa.String(40)),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("lines", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("reason", sa.String(500)),
        sa.Column("approval_id", UUID),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("branch_id", UUID, sa.ForeignKey("branches.id", ondelete="SET NULL")),
        sa.Column("customer_id", UUID, sa.ForeignKey("sales_customers.id", ondelete="SET NULL")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_discount_applied_tenant_id", "discount_applied", ["tenant_id"])
    op.create_index("ix_discount_applied_order", "discount_applied", ["order_id"])
    op.create_index("ix_discount_applied_rule", "discount_applied", ["tenant_id", "rule_id"])
    op.create_index("ix_discount_applied_created", "discount_applied", ["tenant_id", "created_at"])
    # The permission catalogue is shared by every business: add the new resource so roles can be granted it.
    for action in ("create", "read", "update", "delete", "approve"):
        op.execute(
            sa.text(
                "INSERT INTO permissions (id, name, resource, action, description, created_at, updated_at) SELECT gen_random_uuid(), :n, 'discounts', :a, :d, now(), now() "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = :n)"
            ).bindparams(n=f"discounts:{action}", a=action, d=f"Can {action} discounts")
        )


def downgrade() -> None:
    op.execute(
        "DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE resource = 'discounts')"
    )
    op.execute("DELETE FROM permissions WHERE resource = 'discounts'")
    for t in (
        "discount_applied",
        "discount_coupon_redemptions",
        "discount_coupons",
        "discount_rules",
        "discount_campaigns",
    ):
        op.drop_table(t)
    op.drop_column("tenants", "discount_settings")
