"""customer support center: channels, conversations, messages, tickets, settings, webhook events

Revision ID: d7e2b9c41a55
Revises: c4d1a7e92b10
Create Date: 2026-10-18 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = 'd7e2b9c41a55'
down_revision: str | None = 'c4d1a7e92b10'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ts = lambda: [  # noqa: E731
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
]


def upgrade() -> None:
    op.create_table(
        'support_channels',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('status', sa.String(30), nullable=False, server_default='disconnected'),
        sa.Column('identity', sa.String(255)),
        sa.Column('last_connected_at', sa.DateTime(timezone=True)),
        sa.Column('last_error', sa.Text()),
        sa.Column('state', postgresql.JSONB()),
        *_ts(),
        sa.UniqueConstraint('kind', 'name', name='uq_support_channels_kind_name'),
    )
    op.create_table(
        'support_conversations',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('channel', sa.String(20), nullable=False),
        sa.Column('external_thread_id', sa.String(255), nullable=False),
        sa.Column('subject', sa.String(500)),
        sa.Column('customer_name', sa.String(255)),
        sa.Column('customer_email', sa.String(255)),
        sa.Column('customer_phone', sa.String(50)),
        sa.Column('tenant_id', sa.UUID(), sa.ForeignKey('tenants.id', ondelete='SET NULL')),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('priority', sa.String(20), nullable=False, server_default='normal'),
        sa.Column('assigned_to', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('unread_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_message_at', sa.DateTime(timezone=True)),
        sa.Column('last_message_preview', sa.String(200)),
        sa.Column('resolved_at', sa.DateTime(timezone=True)),
        sa.Column('first_response_at', sa.DateTime(timezone=True)),
        sa.Column('ack_sent_at', sa.DateTime(timezone=True)),
        sa.Column('meta', postgresql.JSONB()),
        *_ts(),
        sa.UniqueConstraint('channel', 'external_thread_id', name='uq_support_conv_channel_thread'),
    )
    op.create_index('ix_support_conv_status_last', 'support_conversations', ['status', 'last_message_at'])
    op.create_index('ix_support_conv_assigned', 'support_conversations', ['assigned_to'])
    op.create_index('ix_support_conv_tenant', 'support_conversations', ['tenant_id'])
    op.create_table(
        'support_messages',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('conversation_id', sa.UUID(), sa.ForeignKey('support_conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('direction', sa.String(10), nullable=False),
        sa.Column('is_internal_note', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('sender_name', sa.String(255)),
        sa.Column('sender_user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('body', sa.Text(), nullable=False, server_default=''),
        sa.Column('attachments', postgresql.JSONB()),
        sa.Column('provider', sa.String(20)),
        sa.Column('provider_message_id', sa.String(255)),
        sa.Column('delivery_status', sa.String(20)),
        sa.Column('delivery_error', sa.Text()),
        sa.Column('meta', postgresql.JSONB()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_support_msg_conv_created', 'support_messages', ['conversation_id', 'created_at'])
    op.create_index('uq_support_msg_provider', 'support_messages', ['provider', 'provider_message_id'], unique=True,
                    postgresql_where=sa.text('provider_message_id IS NOT NULL'))
    op.create_table(
        'support_tickets',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('number', sa.Integer(), sa.Identity(always=False), nullable=False, unique=True),
        sa.Column('tenant_id', sa.UUID(), sa.ForeignKey('tenants.id', ondelete='SET NULL')),
        sa.Column('conversation_id', sa.UUID(), sa.ForeignKey('support_conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('requester_user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('subject', sa.String(500), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('priority', sa.String(20), nullable=False, server_default='normal'),
        sa.Column('assigned_to', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('created_by', sa.UUID(), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('resolved_at', sa.DateTime(timezone=True)),
        *_ts(),
    )
    op.create_index('ix_support_tickets_status', 'support_tickets', ['status', 'created_at'])
    op.create_index('ix_support_tickets_tenant', 'support_tickets', ['tenant_id', 'created_at'])
    op.create_index('ix_support_tickets_assigned', 'support_tickets', ['assigned_to'])
    op.create_index('ix_support_tickets_conversation', 'support_tickets', ['conversation_id'])
    op.create_table(
        'support_settings',
        sa.Column('key', sa.String(50), primary_key=True),
        sa.Column('value', postgresql.JSONB(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        'support_webhook_events',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('provider', sa.String(20), nullable=False),
        sa.Column('delivery_id', sa.String(255), nullable=False),
        sa.Column('event', sa.String(100)),
        sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('provider', 'delivery_id', name='uq_support_webhook_delivery'),
    )


def downgrade() -> None:
    for t in ('support_webhook_events', 'support_settings', 'support_tickets', 'support_messages', 'support_conversations', 'support_channels'):
        op.drop_table(t)
