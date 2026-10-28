"""Tenant lifecycle records: notifications, data exports and archive (deletion) requests."""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
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
