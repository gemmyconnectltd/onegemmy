"""Platform marketing (Super Admin → Marketing). Entirely separate from the tenant ERP CRM module: these tables hold
Pesaa's own communications with businesses and leads, and are only reachable by platform staff."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class MarketingContact(UUIDPKMixin, TimestampMixin, Base):
    """One recipient (a business's owner, or an imported lead). Business rows are kept in step with `tenants`."""

    __tablename__ = "marketing_contacts"

    email: Mapped[str] = mapped_column(String(255), unique=True)  # always lower-case
    name: Mapped[str | None] = mapped_column(String(255))
    business_name: Mapped[str | None] = mapped_column(String(255))
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    country: Mapped[str | None] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(20), default="tenant")  # tenant | import | manual
    # Suppression state — anything other than "active" is never sent marketing.
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | unsubscribed | bounced | complained | invalid
    status_reason: Mapped[str | None] = mapped_column(String(200))
    status_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Consent is recorded, never assumed: unknown until an admin records where it came from.
    consent: Mapped[str] = mapped_column(String(20), default="unknown")  # subscribed | unknown
    consent_source: Mapped[str | None] = mapped_column(String(100))
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    newsletter_subscribed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    newsletter_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tags: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    email_valid: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    invalid_reason: Mapped[str | None] = mapped_column(String(100))

    __table_args__ = (Index("ix_marketing_contacts_status", "status"),)


class MarketingSegment(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "marketing_segments"

    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str | None] = mapped_column(String(300))
    filters: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))


class MarketingTemplate(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "marketing_templates"

    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(30))  # campaign | newsletter | onboarding | announcement | transactional
    description: Mapped[str | None] = mapped_column(String(300))
    subject: Mapped[str | None] = mapped_column(String(300))
    preheader: Mapped[str | None] = mapped_column(String(200))
    blocks: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | archived
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))


class MarketingCampaign(UUIDPKMixin, TimestampMixin, Base):
    """A one-time campaign, a recurring newsletter (the series) or one issue of a newsletter. All three are delivered
    by the same send engine; they differ only in scheduling and audience rules."""

    __tablename__ = "marketing_campaigns"

    kind: Mapped[str] = mapped_column(String(12), default="campaign")  # campaign | newsletter | issue
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("marketing_campaigns.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200))
    campaign_type: Mapped[str] = mapped_column(String(30), default="promotional")  # promotional | announcement | product_update | newsletter
    subject: Mapped[str] = mapped_column(String(300), default="")
    preheader: Mapped[str | None] = mapped_column(String(200))
    sender_name: Mapped[str | None] = mapped_column(String(120))
    sender_email: Mapped[str | None] = mapped_column(String(255))
    reply_to: Mapped[str | None] = mapped_column(String(255))
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("marketing_templates.id", ondelete="SET NULL"))
    blocks: Mapped[list] = mapped_column(JSONB, default=list)
    audience: Mapped[dict] = mapped_column(JSONB, default=dict)  # {segment_id?, filters}
    status: Mapped[str] = mapped_column(String(12), default="draft")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    recipient_count: Mapped[int] = mapped_column(Integer, default=0)
    schedule: Mapped[dict | None] = mapped_column(JSONB)  # newsletters: {frequency, weekday, day, hour, next_run_at}
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (Index("ix_marketing_campaigns_status_sched", "status", "scheduled_at"), Index("ix_marketing_campaigns_kind", "kind", "created_at"))


class MarketingAutomation(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "marketing_automations"

    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(20))  # welcome | onboarding | announcement | renewal | reengagement
    trigger: Mapped[str] = mapped_column(String(30))  # signup | no_sale_after_signup | renewal_due | inactive | manual
    delay_hours: Mapped[int] = mapped_column(Integer, default=0)
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("marketing_templates.id", ondelete="SET NULL"))
    subject: Mapped[str] = mapped_column(String(300), default="")
    preheader: Mapped[str | None] = mapped_column(String(200))
    blocks: Mapped[list] = mapped_column(JSONB, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))


class MarketingSend(UUIDPKMixin, Base):
    """One message to one contact — the outbox. `pending` rows are picked up by the worker; a row is `sent` only once
    the mail server has accepted the message. The unique indexes make a campaign/automation send once per contact."""

    __tablename__ = "marketing_sends"

    campaign_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("marketing_campaigns.id", ondelete="CASCADE"))
    automation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("marketing_automations.id", ondelete="CASCADE"))
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("marketing_contacts.id", ondelete="CASCADE"))
    email: Mapped[str] = mapped_column(String(255))
    dedupe_key: Mapped[str] = mapped_column(String(40), default="", server_default="")
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | sending | sent | failed | skipped | bounced
    reason: Mapped[str | None] = mapped_column(String(300))
    message_id: Mapped[str | None] = mapped_column(String(255))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    send_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opens: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    clicks: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    first_open_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_click_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    unsubscribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("uq_marketing_sends_campaign_contact", "campaign_id", "contact_id", unique=True, postgresql_where=text("campaign_id IS NOT NULL")),
        Index("uq_marketing_sends_automation_contact", "automation_id", "contact_id", "dedupe_key", unique=True, postgresql_where=text("automation_id IS NOT NULL")),
        Index("ix_marketing_sends_due", "status", "next_attempt_at"),
        Index("ix_marketing_sends_campaign_status", "campaign_id", "status"),
        Index("ix_marketing_sends_contact", "contact_id", "queued_at"),
    )


class MarketingEvent(UUIDPKMixin, Base):
    """Engagement we can observe ourselves: an open (tracking pixel), a click (tracked link) or an unsubscribe."""

    __tablename__ = "marketing_events"

    send_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("marketing_sends.id", ondelete="CASCADE"))
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    automation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    kind: Mapped[str] = mapped_column(String(12))  # open | click | unsubscribe
    url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_marketing_events_created", "created_at"), Index("ix_marketing_events_campaign", "campaign_id", "kind"))


class MarketingSetting(Base):
    __tablename__ = "marketing_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

