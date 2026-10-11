import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class OrderPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_method: str | None = None
    reference_number: str | None = None
    notes: str | None = None
    paid_at: datetime | None = None
    branch_id: uuid.UUID | None = None
    client_payment_id: str | None = None
    # Currency the money was actually handed over in; defaults to the order's own currency.
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    # The one rate the conversion needs on the payment date (see app.core.currency.compute_settlement).
    # Omit to use the tenant/platform rate effective at `paid_at`; required when none exists.
    exchange_rate: Decimal | None = Field(default=None, gt=0)


class OrderPaymentReverse(BaseModel):
    reason: str | None = None


class OrderPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    order_id: uuid.UUID
    customer_id: uuid.UUID | None
    branch_id: uuid.UUID | None
    amount: float
    payment_method: str | None
    reference_number: str | None
    notes: str | None
    status: str
    paid_at: datetime
    received_by: uuid.UUID | None
    received_by_name: str | None = None
    reversed_at: datetime | None
    reversed_by: uuid.UUID | None
    reversal_reason: str | None
    created_at: datetime | None = None
    # `amount` is in `currency_code`; `applied_amount` is what it took off the invoice (invoice
    # currency); `base_amount` is the cash in the tenant's base currency at `exchange_rate`.
    currency_code: str | None = None
    exchange_rate: Decimal | None = None
    base_amount: Decimal | None = None
    applied_amount: Decimal | None = None
    base_applied_amount: Decimal | None = None
