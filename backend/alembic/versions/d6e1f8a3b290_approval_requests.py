"""approval requests

Revision ID: d6e1f8a3b290
Revises: c3a9d51e7f26
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'd6e1f8a3b290'
down_revision: str | None = 'c3a9d51e7f26'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'approval_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('branch_id', sa.UUID(), nullable=True),
        sa.Column('kind', sa.String(length=30), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('subject_id', sa.UUID(), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('requested_by', sa.UUID(), nullable=True),
        sa.Column('requested_by_name', sa.String(length=255), nullable=True),
        sa.Column('decided_by', sa.UUID(), nullable=True),
        sa.Column('decided_by_name', sa.String(length=255), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decision_note', sa.Text(), nullable=True),
        sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['decided_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['requested_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_approval_requests_tenant_id', 'approval_requests', ['tenant_id'])
    op.create_index('ix_approval_requests_tenant_status', 'approval_requests', ['tenant_id', 'status', 'created_at'])
    op.create_index('ix_approval_requests_subject', 'approval_requests', ['tenant_id', 'kind', 'subject_id'])


def downgrade() -> None:
    op.drop_index('ix_approval_requests_subject', table_name='approval_requests')
    op.drop_index('ix_approval_requests_tenant_status', table_name='approval_requests')
    op.drop_index('ix_approval_requests_tenant_id', table_name='approval_requests')
    op.drop_table('approval_requests')
