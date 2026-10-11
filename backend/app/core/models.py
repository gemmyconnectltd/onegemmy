import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPKMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class DocumentCurrencyMixin:
    """Currency context for a financial document (invoice, bill, expense, return).

    ``currency_code`` is the document's own currency (ISO 4217); ``exchange_rate`` is units of the
    tenant's *base* currency per 1 unit of it, frozen when the document became financially
    effective. Amounts on the document stay in its own currency; a ``base_*`` twin holds the base
    value at that frozen rate. NULL on both means a row from before multi-currency existed, which
    by construction was recorded in the tenant's base currency at a rate of 1 — read it through
    ``app.modules.currency.service.document_rate`` rather than assuming either way.
    """

    currency_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    exchange_rate: Mapped[Decimal | None] = mapped_column(Numeric(20, 10), nullable=True)


class PaymentCurrencyMixin(DocumentCurrencyMixin):
    """A payment against a (possibly foreign-currency) invoice or bill.

    ``amount``/``currency_code`` are what was actually tendered. ``exchange_rate`` is the
    *payment currency → base* rate on the payment date (1 when paid in base currency).
    ``base_amount`` is the cash in base
    currency; ``applied_amount`` reduces the document's balance (document currency);
    ``base_applied_amount`` is the receivable/payable carrying value cleared (base, at the
    document's own frozen rate). ``base_amount - base_applied_amount`` is the realised FX result.
    """

    base_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    applied_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    base_applied_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
