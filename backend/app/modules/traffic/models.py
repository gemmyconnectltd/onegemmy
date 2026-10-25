import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import UUIDPKMixin


class WebsiteVisit(UUIDPKMixin, Base):
    """One anonymous page view on the public marketing website.

    Privacy: no IP address, user agent or any personal data is stored. `visitor_id` is a random identifier the
    browser generates for itself; it is only ever linked to a business when that browser registers.
    """

    __tablename__ = "website_visits"

    visitor_id: Mapped[str] = mapped_column(String(64))
    path: Mapped[str] = mapped_column(String(200))
    # direct | organic | social | referral | paid | other — derived server-side at write time.
    channel: Mapped[str] = mapped_column(String(20))
    referrer_host: Mapped[str | None] = mapped_column(String(120))
    utm_source: Mapped[str | None] = mapped_column(String(100))
    utm_medium: Mapped[str | None] = mapped_column(String(100))
    utm_campaign: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_website_visits_created", "created_at"),
        Index("ix_website_visits_visitor_created", "visitor_id", "created_at"),
    )


class ErpActivity(UUIDPKMixin, Base):
    """One page view inside the signed-in ERP / POS app: who (tenant + user), where (module) and when.

    Written by the app itself once a user is authenticated. No page content, query strings, names or other personal
    data are stored; `session_id` is a random per-tab id that rotates after 30 minutes of inactivity.
    """

    __tablename__ = "erp_activity"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(64))
    module: Mapped[str] = mapped_column(String(30))
    surface: Mapped[str] = mapped_column(String(10))  # erp | pos
    path: Mapped[str] = mapped_column(String(200))
    # Coarse labels derived from the User-Agent header at write time (null on rows recorded before this existed).
    device: Mapped[str | None] = mapped_column(String(10))  # desktop | mobile | tablet
    os: Mapped[str | None] = mapped_column(String(20))
    browser: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_erp_activity_created", "created_at"),
        Index("ix_erp_activity_tenant_created", "tenant_id", "created_at"),
        Index("ix_erp_activity_user_created", "user_id", "created_at"),
    )


__all__ = ["ErpActivity", "WebsiteVisit"]
