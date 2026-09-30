import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OrderPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_method: str | None = None
    reference_number: str | None = None
    notes: str | None = None
    paid_at: datetime | None = None
    branch_id: uuid.UUID | None = None
    client_payment_id: str | None = None


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
