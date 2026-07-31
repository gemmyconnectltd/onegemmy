import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.modules.sales.schemas.customer import CustomerRead
from app.modules.sales.schemas.return_item import ReturnItemCreate, ReturnItemRead


class ReturnCreate(BaseModel):
    order_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    reason: str | None = None
    status: str = "Pending"
    return_date: date
    items: list[ReturnItemCreate] = []


class ReturnUpdate(BaseModel):
    order_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    reason: str | None = None
    status: str | None = None
    return_date: date | None = None
    processed_by: uuid.UUID | None = None


class ReturnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    return_number: str
    order_id: uuid.UUID | None
    customer_id: uuid.UUID | None
    reason: str | None
    refund_amount: float
    status: str
    processed_by: uuid.UUID | None
    return_date: date
    customer: CustomerRead | None = None
    items: list[ReturnItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
