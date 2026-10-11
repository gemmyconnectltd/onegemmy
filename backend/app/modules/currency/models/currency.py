import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.models import TimestampMixin, UUIDPKMixin


class Currency(Base):
    """Currency master data (ISO 4217). Definitions live in app.core.currency_data; this table is
    the runtime copy that carries `is_active` and gives rates/settings something to reference."""

    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    symbol: Mapped[str] = mapped_column(String(10), nullable=False)
    decimal_places: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=2)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExchangeRate(UUIDPKMixin, TimestampMixin, Base):
    """``1 base_currency = rate quote_currency`` from ``effective_at`` onward.

    Append-only history: a new rate is a new row, never an update, so any past conversion can be
    reproduced. `tenant_id` NULL is a platform-wide rate (used for cross-tenant analytics and as
    the fallback); a tenant's own rows are visible to that tenant only and win over platform ones.
    """

    __tablename__ = "exchange_rates"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True
    )
    base_currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"), nullable=False)
    quote_currency: Mapped[str] = mapped_column(String(3), ForeignKey("currencies.code"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(20, 10), nullable=False)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    # manual | provider:<name> — only manual exists today; the column lets an automated feed
    # be added later without a schema change.
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="manual")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        CheckConstraint("rate > 0", name="ck_exchange_rates_positive"),
        CheckConstraint("base_currency <> quote_currency", name="ck_exchange_rates_distinct"),
        # Rate lookup: latest row at/before a moment for a pair, per scope.
        Index("ix_exchange_rates_lookup", "tenant_id", "base_currency", "quote_currency", "effective_at"),
    )


class PlatformSetting(Base):
    """Platform-wide (PESAA) configuration as key → JSON, e.g. ``reporting_currency``."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict | str | None] = mapped_column(JSONB, nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
