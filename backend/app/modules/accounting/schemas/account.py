import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AccountCreate(BaseModel):
    code: str
    name: str
    type: str  # Assets | Liabilities | Equity | Revenue | Expense
    normal_balance: str  # debit | credit
    description: str | None = None
    is_active: bool = True


class AccountUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class AccountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    code: str
    name: str
    type: str
    normal_balance: str
    description: str | None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
