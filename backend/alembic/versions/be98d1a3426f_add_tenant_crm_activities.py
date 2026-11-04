"""Add tenant-scoped CRM activities.

Revision ID: be98d1a3426f
Revises: a4e8c1d7f093
Create Date: 2026-11-04
"""
from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "be98d1a3426f"
down_revision: str | None = "a4e8c1d7f093"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "crm_activities",
        sa.Column("customer_id", sa.UUID(), nullable=True),
        sa.Column("deal_id", sa.UUID(), nullable=True),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["customer_id"], ["sales_customers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["deal_id"], ["sales_deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_crm_activities_tenant_due", "crm_activities", ["tenant_id", "due_at"])
    op.create_index("ix_crm_activities_tenant_status", "crm_activities", ["tenant_id", "status"])
    op.create_index("ix_crm_activities_customer", "crm_activities", ["tenant_id", "customer_id"])
    op.create_index("ix_crm_activities_deal", "crm_activities", ["tenant_id", "deal_id"])


def downgrade() -> None:
    op.drop_index("ix_crm_activities_deal", table_name="crm_activities")
    op.drop_index("ix_crm_activities_customer", table_name="crm_activities")
    op.drop_index("ix_crm_activities_tenant_status", table_name="crm_activities")
    op.drop_index("ix_crm_activities_tenant_due", table_name="crm_activities")
    op.drop_table("crm_activities")
