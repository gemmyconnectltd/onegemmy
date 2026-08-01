import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.finance.schemas.account import AccountRead


class BudgetCreate(BaseModel):
    account_id: uuid.UUID
    period: str  # YYYY-MM
    amount: float


class BudgetUpdate(BaseModel):
    amount: float | None = None


class BudgetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    account_id: uuid.UUID
    period: str
    amount: float
    spent: float
    account: AccountRead | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
