"""Full control over each module and part: status, messages, schedule, rollout, kill switch, actions, beta cohort

Revision ID: f1b7d2e9a405
Revises: e6a1c9f4b702

Additive only. Two new tables and no rows: a module or part without a feature_controls row keeps its current
behaviour (active for everyone, or inactive where Pesaa already switched it off). Rollback: `alembic downgrade e6a1c9f4b702`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'f1b7d2e9a405'
down_revision: str | None = 'e6a1c9f4b702'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STATUSES = "'active', 'inactive', 'coming_soon', 'beta', 'maintenance', 'deprecated'"


def upgrade() -> None:
    op.create_table(
        "feature_controls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(120), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("message", sa.String(500), nullable=True),
        sa.Column("scheduled_status", sa.String(20), nullable=True),
        sa.Column("scheduled_message", sa.String(500), nullable=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rollout_percent", sa.Integer, nullable=False, server_default="100"),
        sa.Column("kill_switch", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("kill_reason", sa.String(255), nullable=True),
        sa.Column("actions", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(f"status IN ({STATUSES})", name="ck_feature_controls_status"),
        sa.CheckConstraint(f"scheduled_status IS NULL OR scheduled_status IN ({STATUSES})", name="ck_feature_controls_scheduled_status"),
        sa.CheckConstraint("rollout_percent BETWEEN 0 AND 100", name="ck_feature_controls_rollout"),
    )
    op.create_index("ix_feature_controls_key", "feature_controls", ["key"], unique=True)

    op.create_table(
        "feature_cohort",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("feature_key", sa.String(120), nullable=False),
        sa.Column("target_type", sa.String(10), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("target_type IN ('tenant', 'branch', 'user')", name="ck_feature_cohort_target_type"),
        sa.UniqueConstraint("feature_key", "target_type", "target_id", name="uq_feature_cohort_target"),
    )
    op.create_index("ix_feature_cohort_feature_key", "feature_cohort", ["feature_key"])
    op.create_index("ix_feature_cohort_tenant_id", "feature_cohort", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_feature_cohort_tenant_id", table_name="feature_cohort")
    op.drop_index("ix_feature_cohort_feature_key", table_name="feature_cohort")
    op.drop_table("feature_cohort")
    op.drop_index("ix_feature_controls_key", table_name="feature_controls")
    op.drop_table("feature_controls")
