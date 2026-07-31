import uuid

from sqlalchemy import ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Target(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "sales_targets"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    target_value: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    achieved_value: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="number")
    period: Mapped[str] = mapped_column(String(50), nullable=False)

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    assignee = relationship("User", foreign_keys=[assigned_to], lazy="joined")

    __table_args__ = (
        Index("ix_sales_targets_tenant_id", "tenant_id"),
        Index("uq_sales_targets_tenant_name_period", "tenant_id", "name", "period", unique=True),
    )
