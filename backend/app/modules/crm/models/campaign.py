from datetime import date

from sqlalchemy import Date, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Campaign(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "crm_campaigns"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), default="Email")
    status: Mapped[str] = mapped_column(String(20), default="Draft")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_count: Mapped[int] = mapped_column(Integer, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    opened_count: Mapped[int] = mapped_column(Integer, default=0)

    emails = relationship("EmailLog", back_populates="campaign", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_crm_campaigns_tenant_status", "tenant_id", "status"),
    )
