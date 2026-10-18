import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin

# Platform-level support data: Pesaa's own support team talking to customers. Rows are NOT tenant-scoped the way
# ERP data is — `tenant_id` only records which Pesaa business a customer belongs to (nullable: an unknown
# WhatsApp number has none). Tenant users only ever see tickets whose tenant_id is their own (see routes.py).

CHANNELS = ("whatsapp", "email", "portal")
CONVERSATION_STATUSES = ("open", "resolved")
TICKET_STATUSES = ("open", "in_progress", "resolved", "closed")
PRIORITIES = ("low", "normal", "high", "urgent")


class SupportChannel(UUIDPKMixin, TimestampMixin, Base):
    """One configured channel account (a WhatsApp session, the support mailbox). Holds ONLY non-secret state:
    credentials live in server environment variables and are never stored here or sent to a browser."""

    __tablename__ = "support_channels"

    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # whatsapp | email
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="disconnected")
    identity: Mapped[str | None] = mapped_column(String(255), nullable=True)  # connected phone / mailbox address
    last_connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # sync cursors etc.

    __table_args__ = (UniqueConstraint("kind", "name", name="uq_support_channels_kind_name"),)


class SupportConversation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "support_conversations"

    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    # Stable key for "the same thread": WhatsApp chatId, email thread id, or the portal ticket's own id.
    external_thread_id: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    unread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_message_preview: Mapped[str | None] = mapped_column(String(200), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ack_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # channel-specific (email thread headers, ...)

    __table_args__ = (
        UniqueConstraint("channel", "external_thread_id", name="uq_support_conv_channel_thread"),
        Index("ix_support_conv_status_last", "status", "last_message_at"),
        Index("ix_support_conv_assigned", "assigned_to"),
        Index("ix_support_conv_tenant", "tenant_id"),
    )


class SupportMessage(UUIDPKMixin, Base):
    __tablename__ = "support_messages"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_conversations.id", ondelete="CASCADE"), nullable=False
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # incoming | outgoing
    is_internal_note: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sender_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    attachments: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    delivery_status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # pending|sent|delivered|read|failed
    delivery_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Set per message in Python, not left to now(): in Postgres now() is the TRANSACTION start, so two messages written
    # in one request would tie and the thread order (and "load earlier" paging) would be arbitrary.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), server_default=func.now())

    __table_args__ = (
        Index("ix_support_msg_conv_created", "conversation_id", "created_at"),
        # Duplicate-event / duplicate-import prevention: one row per provider message.
        Index("uq_support_msg_provider", "provider", "provider_message_id", unique=True,
              postgresql_where="provider_message_id IS NOT NULL"),
    )


class SupportTicket(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "support_tickets"

    number: Mapped[int] = mapped_column(Integer, Identity(always=False), unique=True, nullable=False)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_conversations.id", ondelete="CASCADE"), nullable=False
    )
    requester_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_support_tickets_status", "status", "created_at"),
        Index("ix_support_tickets_tenant", "tenant_id", "created_at"),
        Index("ix_support_tickets_assigned", "assigned_to"),
        Index("ix_support_tickets_conversation", "conversation_id"),
    )

    @property
    def reference(self) -> str:
        return f"PES-{self.number:06d}"


class SupportSetting(Base):
    """Key/value JSON settings (business hours, automation, retention)."""

    __tablename__ = "support_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SupportWebhookEvent(UUIDPKMixin, Base):
    """Every webhook delivery received, keyed by the provider's delivery id so a retried delivery is a no-op."""

    __tablename__ = "support_webhook_events"

    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    delivery_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event: Mapped[str | None] = mapped_column(String(100), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("provider", "delivery_id", name="uq_support_webhook_delivery"),)
