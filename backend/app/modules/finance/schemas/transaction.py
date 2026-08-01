import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.finance.schemas.transaction_line import TransactionLineCreate, TransactionLineRead


class TransactionCreate(BaseModel):
    type: str  # sale | return | expense | adjustment | manual
    transaction_date: str  # date string YYYY-MM-DD
    description: str | None = None
    order_id: uuid.UUID | None = None
    return_id: uuid.UUID | None = None
    lines: list[TransactionLineCreate] = []


class TransactionUpdate(BaseModel):
    status: str | None = None  # Draft | Posted | Void
    description: str | None = None


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    type: str
    status: str
    transaction_date: str | None = None
    description: str | None = None
    order_id: uuid.UUID | None = None
    return_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    lines: list[TransactionLineRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
