"""Additional discount authority grants and tenant-scoped usage indexes.

Revision ID: d6e2b9f4a103
Revises: c5d1a8e2f973
"""

import sqlalchemy as sa

from alembic import op

revision = "d6e2b9f4a103"
down_revision = "c5d1a8e2f973"
branch_labels = None
depends_on = None

ACTIONS = ("activate", "apply", "promotions", "coupons", "analytics", "settings")
INDEXES = (
    ("ix_discount_applied_campaign", "discount_applied", ["tenant_id", "campaign_id"]),
    ("ix_discount_applied_branch", "discount_applied", ["tenant_id", "branch_id", "created_at"]),
    (
        "ix_discount_redemptions_customer",
        "discount_coupon_redemptions",
        ["tenant_id", "coupon_id", "customer_id"],
    ),
)


def upgrade() -> None:
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns, if_not_exists=True)
    for action in ACTIONS:
        op.execute(
            sa.text(
                "INSERT INTO permissions (id, name, resource, action, description, created_at, updated_at) "
                "SELECT gen_random_uuid(), :name, 'discounts', :action, :description, now(), now() "
                "WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE name = :name)"
            ).bindparams(
                name=f"discounts:{action}", action=action, description=f"Can {action} discounts"
            )
        )


def downgrade() -> None:
    for action in ACTIONS:
        op.execute(
            sa.text(
                "DELETE FROM role_permissions WHERE permission_id IN (SELECT id FROM permissions WHERE name=:name)"
            ).bindparams(name=f"discounts:{action}")
        )
        op.execute(
            sa.text("DELETE FROM permissions WHERE name=:name").bindparams(
                name=f"discounts:{action}"
            )
        )
    for name, table, _columns in reversed(INDEXES):
        op.drop_index(name, table_name=table, if_exists=True)
