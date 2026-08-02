from datetime import date

from sqlalchemy import Date, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Applicant(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "hr_applicants"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    position: Mapped[str | None] = mapped_column(String(100))
    stage: Mapped[str] = mapped_column(String(30), default="Applied")  # Applied | Screening | Interview | Offer | Hired | Rejected
    applied_date: Mapped[date] = mapped_column(Date, nullable=False)

    __table_args__ = (
        Index("ix_hr_applicants_tenant_id", "tenant_id"),
        Index("ix_hr_applicants_stage", "tenant_id", "stage"),
    )
