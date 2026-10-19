import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.accounting.schemas.account import AccountRead


class ExpenseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    expense_date: date
    category: str = Field(default="Other", min_length=1, max_length=50)
    notes: str | None = None
    branch_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None
    payment_method: Literal["Cash", "Bank Transfer", "Mobile Money", "Card"] = "Cash"
    reference_number: str | None = Field(default=None, max_length=100)
    client_reference: str | None = Field(default=None, min_length=3, max_length=50)
    account_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None
    # Foreign-currency expense (e.g. an international supplier invoice). Omit for the tenant's base
    # currency. `exchange_rate` = units of base currency per 1 `currency_code`; omit to use the rate in
    # force on `expense_date`.
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)


    @field_validator("title", "category")
    @classmethod
    def meaningful_text(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("A nonempty value is required")
        return value


class ExpenseBulkCreate(BaseModel):
    items: list[ExpenseCreate]


class ExpenseBulkResult(BaseModel):
    created: int
    failed: int
    errors: list[str] = []


class ExpenseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    expense_date: date | None = None
    category: str | None = Field(default=None, min_length=1, max_length=50)
    # Status changes use the approval/rejection services, never a generic edit.
    notes: str | None = None
    supplier_id: uuid.UUID | None = None
    payment_method: Literal["Cash", "Bank Transfer", "Mobile Money", "Card"] | None = None
    reference_number: str | None = Field(default=None, max_length=100)
    account_id: uuid.UUID | None = None
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    exchange_rate: Decimal | None = Field(default=None, gt=0)


    @field_validator("title", "category")
    @classmethod
    def meaningful_text(cls, value: str | None) -> str | None:
        if value is not None:
            value = value.strip()
            if not value:
                raise ValueError("A nonempty value is required")
        return value


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
    branch_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None
    payment_method: str = "Cash"
    reference_number: str | None = None
    receipt_name: str | None = None
    receipt_type: str | None = None
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
