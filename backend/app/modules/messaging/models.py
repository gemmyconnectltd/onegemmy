"""A business messaging its own customers by SMS, email and WhatsApp.

Separate from platform marketing (app/modules/marketing), which is Pesaa talking to businesses. Every message is one row in
`messaging_messages`, delivered only by `engine.deliver` (one send path), and only after `eligibility.check` (one rule)."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin

CHANNELS = ("sms", "email", "whatsapp")
# marketing: promotions and news, only to customers who agreed. service: about their own account (a balance, a sale, a birthday wish),
# sent unless they said no.
PURPOSES = ("marketing", "service")
STATUSES = ("queued", "sending", "sent", "failed", "skipped")
AUTOMATIONS = ("debt_reminder", "thank_you", "birthday")


class CustomerConsent(UUIDPKMixin, TenantScopedMixin, Base):
    """Every change of a customer's agreement to be contacted on a channel. Rows are only added; the latest per channel is copied onto
    Customer.contact_consent so lists and audiences can filter on it."""
    __tablename__ = "messaging_consents"

    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="CASCADE"), nullable=False)
    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)  # granted | revoked
    source: Mapped[str] = mapped_column(String(30), nullable=False)  # staff | unsubscribe_link | customer_reply | import
    note: Mapped[str | None] = mapped_column(String(255))
    recorded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_messaging_consents_customer", "tenant_id", "customer_id", "created_at"),)


class MessageTemplate(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "messaging_templates"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    channel: Mapped[str] = mapped_column(String(10), nullable=False, default="any")  # any | sms | email | whatsapp
    purpose: Mapped[str] = mapped_column(String(10), nullable=False, default="marketing")
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (Index("uq_messaging_templates_name", "tenant_id", func.lower(name), unique=True),)


class Segment(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A saved group of customers, defined by rules (see audience.RULES), so the same people can be messaged again later."""
    __tablename__ = "messaging_segments"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (Index("uq_messaging_segments_name", "tenant_id", func.lower(name), unique=True),)


class Broadcast(UUIDPKMixin, TenantScopedMixin, Base):
    """One message sent to many customers at once. Its rules and text are frozen when it is sent."""
    __tablename__ = "messaging_broadcasts"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    purpose: Mapped[str] = mapped_column(String(10), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    audience: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (Index("ix_messaging_broadcasts_tenant", "tenant_id", "created_at"),)


class CustomerMessage(UUIDPKMixin, TenantScopedMixin, Base):
    """One message to one customer on one channel, and what happened to it."""
    __tablename__ = "messaging_messages"

    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    purpose: Mapped[str] = mapped_column(String(10), nullable=False)
    to_address: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="queued")
    error: Mapped[str | None] = mapped_column(String(500))  # why it failed or was skipped
    provider_ref: Mapped[str | None] = mapped_column(String(200))
    broadcast_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("messaging_broadcasts.id", ondelete="SET NULL"))
    automation: Mapped[str | None] = mapped_column(String(20))
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))  # e.g. the sale a thank-you is for
    sent_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_messaging_messages_tenant", "tenant_id", "created_at"),
        Index("ix_messaging_messages_customer", "tenant_id", "customer_id", "created_at"),
        Index("ix_messaging_messages_queued", "status", "created_at", postgresql_where="status = 'queued'"),
        Index("ix_messaging_messages_automation", "tenant_id", "automation", "customer_id", "created_at"),
    )


class Automation(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    """A business's automatic message of one kind: payment reminders, thank-you after a sale, birthday wishes. Off until switched on."""
    __tablename__ = "messaging_automations"

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    channel: Mapped[str] = mapped_column(String(10), nullable=False, default="sms")
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("uq_messaging_automations_kind", "tenant_id", "kind", unique=True),)
