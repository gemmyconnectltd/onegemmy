import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.modules.sales.schemas.customer import CustomerRead


class DealCreate(BaseModel):
    name: str
    value: float = 0
    stage: str = "Leads"
    probability: int = 50
    customer_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    expected_close_date: date | None = None
    notes: str | None = None


class DealUpdate(BaseModel):
    name: str | None = None
    value: float | None = None
    stage: str | None = None
    probability: int | None = None
    customer_id: uuid.UUID | None = None
    owner_id: uuid.UUID | None = None
    expected_close_date: date | None = None
    notes: str | None = None


class DealRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    value: float
    stage: str
    probability: int
    customer_id: uuid.UUID | None
    owner_id: uuid.UUID | None
    expected_close_date: date | None
    notes: str | None
    customer: CustomerRead | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
