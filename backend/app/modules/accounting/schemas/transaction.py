import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.accounting.schemas.transaction_line import (
    TransactionLineCreate,
    TransactionLineRead,
)


class TransactionCreate(BaseModel):
    type: str  # sale | return | expense | adjustment | manual | purchase
    transaction_date: str  # date string YYYY-MM-DD
    description: str | None = Field(default=None, max_length=2000)
    order_id: uuid.UUID | None = None
    return_id: uuid.UUID | None = None
    purchase_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    client_reference: str | None = Field(default=None, min_length=3, max_length=50)
    lines: list[TransactionLineCreate] = Field(default_factory=list, min_length=2, max_length=200)

    @field_validator("transaction_date")
    @classmethod
    def valid_date(cls, value: str) -> str:
        return date.fromisoformat(value).isoformat()


class TransactionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Lifecycle transitions are only available through authorized post/void endpoints.
    description: str | None = None


class TransactionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    type: str
    status: str
    transaction_date: date | None = None
    description: str | None = None
    order_id: uuid.UUID | None = None
    return_id: uuid.UUID | None = None
    purchase_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    created_by: uuid.UUID | None = None
    lines: list[TransactionLineRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
