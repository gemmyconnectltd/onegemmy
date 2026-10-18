import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.accounting.schemas.account import AccountRead


class TransactionLineCreate(BaseModel):
    account_id: uuid.UUID
    type: Literal["debit", "credit"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    description: str | None = None


class TransactionLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transaction_id: uuid.UUID
    account_id: uuid.UUID
    type: str
    amount: float
    description: str | None = None
    account: AccountRead | None = None
    created_at: datetime | None = None
