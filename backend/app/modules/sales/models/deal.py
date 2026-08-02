import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin
from app.modules.tenants.models.mixins import TenantScopedMixin


class Deal(UUIDPKMixin, TenantScopedMixin, TimestampMixin, Base):
    __tablename__ = "sales_deals"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    stage: Mapped[str] = mapped_column(String(50), nullable=False, default="Leads")
    probability: Mapped[int] = mapped_column(Integer, default=50)
    expected_close_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sales_customers.id", ondelete="SET NULL"), nullable=True
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    customer = relationship("Customer", back_populates="deals", lazy="select")
    owner = relationship("User", foreign_keys=[owner_id], lazy="select")
    orders = relationship("Order", back_populates="deal", lazy="selectin")

    __table_args__ = (
        Index("ix_sales_deals_tenant_id", "tenant_id"),
        Index("ix_sales_deals_tenant_stage", "tenant_id", "stage"),
        Index("ix_sales_deals_owner_id", "owner_id"),
    )
