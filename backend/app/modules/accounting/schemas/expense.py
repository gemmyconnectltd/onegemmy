import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.accounting.schemas.account import AccountRead


class ExpenseCreate(BaseModel):
    title: str
    amount: float
    expense_date: date
    category: str = "Other"
    notes: str | None = None
    account_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None
    # Foreign-currency expense (e.g. an international supplier invoice). Omit for the tenant's base
    # currency. `exchange_rate` = units of base currency per 1 `currency_code`; omit to use the rate in
    # force on `expense_date`.
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)


class ExpenseBulkCreate(BaseModel):
    items: list[ExpenseCreate]


class ExpenseBulkResult(BaseModel):
    created: int
    failed: int
    errors: list[str] = []


class ExpenseUpdate(BaseModel):
    title: str | None = None
    amount: float | None = None
    expense_date: date | None = None
    category: str | None = None
    status: str | None = None  # Pending | Approved | Rejected
    notes: str | None = None
    account_id: uuid.UUID | None = None
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    title: str
    amount: float
    expense_date: date
    category: str
    status: str
    notes: str | None = None
    account_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None
    approved_by: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    # `amount` is in `currency_code` (None = tenant base currency); `base_amount` is its value in the
    # tenant's base currency at the frozen `exchange_rate`.
    currency_code: str | None = None
    exchange_rate: Decimal | None = None
    base_amount: Decimal | None = None
    account: AccountRead | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
