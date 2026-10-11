import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SupplierBillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    purchase_order_id: uuid.UUID
    supplier_id: uuid.UUID | None
    amount: float
    amount_paid: float
    status: str
    bill_date: date
    po_reference: str | None = None
    supplier_name: str | None = None
    balance: float = 0
    # `amount`/`amount_paid`/`balance` are in `currency_code` (None = tenant base currency);
    # `base_amount` is the payable the ledger carries, in base currency at the bill's frozen rate.
    currency_code: str | None = None
    exchange_rate: Decimal | None = None
    base_amount: Decimal | None = None
    base_balance: Decimal | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SupplierPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_method: str | None = None
    # Currency actually paid in (default: the bill's currency) and the one rate the conversion needs on
    # the payment date (see app.core.currency.compute_settlement). Omit the rate to use the
    # tenant/platform rate in force now; required when none exists.
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)


class SupplierPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    bill_id: uuid.UUID
    amount: float
    payment_method: str | None
    paid_at: datetime
    created_at: datetime | None = None
    currency_code: str | None = None
    exchange_rate: Decimal | None = None
    base_amount: Decimal | None = None
    applied_amount: Decimal | None = None
    base_applied_amount: Decimal | None = None
