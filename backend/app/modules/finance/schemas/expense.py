import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.modules.finance.schemas.account import AccountRead


class ExpenseCreate(BaseModel):
    title: str
    amount: float
    expense_date: date
    category: str = "Other"
    notes: str | None = None
    account_id: uuid.UUID | None = None
    order_id: uuid.UUID | None = None


class ExpenseUpdate(BaseModel):
    title: str | None = None
    amount: float | None = None
    expense_date: date | None = None
    category: str | None = None
    status: str | None = None  # Pending | Approved | Rejected
    notes: str | None = None
    account_id: uuid.UUID | None = None


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
    account: AccountRead | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
