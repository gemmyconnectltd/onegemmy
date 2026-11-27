"""Tenant lifecycle records: notifications, data exports and archive (deletion) requests."""
import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


def _tenant_fk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)


def _user_fk() -> Mapped[uuid.UUID | None]:
    return mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))


class TenantNotification(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "tenant_notifications"

    tenant_id: Mapped[uuid.UUID] = _tenant_fk()
    created_by: Mapped[uuid.UUID | None] = _user_fk()
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # announcement | billing | maintenance | security
    audience: Mapped[str] = mapped_column(String(20), nullable=False)  # owner | admins | selected | all
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    action_url: Mapped[str | None] = mapped_column(String(500))
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    recipient_count: Mapped[int] = mapped_column(Integer, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="sent")  # sent | partial | failed

    __table_args__ = (Index("ix_tenant_notifications_tenant", "tenant_id", "created_at"),)


class TenantNotificationDelivery(UUIDPKMixin, Base):
    __tablename__ = "tenant_notification_deliveries"

    notification_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenant_notifications.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)  # sent | failed
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_tenant_notification_deliveries_notification", "notification_id"),)


class TenantExport(UUIDPKMixin, TimestampMixin, Base):
    """An audited request to export a tenant's data. The file is built on download, never stored."""
    __tablename__ = "tenant_exports"

    tenant_id: Mapped[uuid.UUID] = _tenant_fk()
    requested_by: Mapped[uuid.UUID | None] = _user_fk()
    categories: Mapped[list] = mapped_column(JSONB, nullable=False)
    fmt: Mapped[str] = mapped_column(String(10), nullable=False)  # csv | xlsx | zip
    date_from: Mapped[date | None] = mapped_column(Date)
    date_to: Mapped[date | None] = mapped_column(Date)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    last_downloaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_downloaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # Set only for the backup a data reset takes first: that file is stored (under uploads/private), unlike a normal export, which is built when downloaded.
    file_path: Mapped[str | None] = mapped_column(String(500))
    file_sha256: Mapped[str | None] = mapped_column(String(64))
    file_bytes: Mapped[int | None] = mapped_column(BigInteger)

    __table_args__ = (Index("ix_tenant_exports_tenant", "tenant_id", "created_at"),)


class TenantDeletionRequest(UUIDPKMixin, TimestampMixin, Base):
    """Archiving a business takes a reason, the typed company name and a second administrator's approval."""
    __tablename__ = "tenant_deletion_requests"

    tenant_id: Mapped[uuid.UUID] = _tenant_fk()
    requested_by: Mapped[uuid.UUID | None] = _user_fk()
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | executed | rejected | cancelled
    checks: Mapped[dict] = mapped_column(JSONB, default=dict)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(String(500))

    __table_args__ = (Index("ix_tenant_deletion_requests_tenant", "tenant_id", "created_at"),)


class EmailProblem(UUIDPKMixin, TimestampMixin, Base):
    """An email Pesaa sent that never reached the person: refused while sending, or bounced back afterwards (a
    "Mail Delivery Subsystem" notice in the sending mailbox). Shown to platform admins so someone follows it up."""
    __tablename__ = "email_problems"

    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(300))
    kind: Mapped[str | None] = mapped_column(String(40))  # account_approved | registration_received | invite | … (what was sent)
    source: Mapped[str] = mapped_column(String(10), nullable=False)  # send (refused while sending) | bounce (came back later)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)  # no_such_address | mailbox_full | domain_not_found | blocked | not_sent | other
    detail: Mapped[str | None] = mapped_column(Text)  # the mail server's own words, e.g. "550 5.1.1 The email account … does not exist"
    smtp_code: Mapped[str | None] = mapped_column(String(20))
    # The bounce notice's Message-ID, so reading the mailbox again never records the same bounce twice.
    source_ref: Mapped[str | None] = mapped_column(String(300), unique=True)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"))
    user_id: Mapped[uuid.UUID | None] = _user_fk()
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="open", nullable=False)  # open | resolved
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = _user_fk()
    resolution: Mapped[str | None] = mapped_column(Text)  # what was done: "Email corrected to … and resent", a note

    __table_args__ = (Index("ix_email_problems_status_occurred", "status", "occurred_at"), Index("ix_email_problems_recipient", "recipient"))
