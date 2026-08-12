import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class BatchCreate(BaseModel):
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    purchase_order_id: uuid.UUID | None = None
    batch_number: str
    quantity: float
    unit_cost: float = 0
    manufactured_date: date | None = None
    expiry_date: date | None = None
    supplier_id: uuid.UUID | None = None
    notes: str | None = None


class BatchUpdate(BaseModel):
    quantity_remaining: float | None = None
    expiry_date: date | None = None
    notes: str | None = None


class BatchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    product_id: uuid.UUID
    variant_id: uuid.UUID | None
    purchase_order_id: uuid.UUID | None
    batch_number: str
    quantity: float
    quantity_remaining: float
    unit_cost: float
    manufactured_date: date | None
    expiry_date: date | None
    received_at: datetime | None = None
    supplier_id: uuid.UUID | None
    notes: str | None
    product_name: str | None = None
    supplier_name: str | None = None
    days_to_expiry: int | None = None
    created_at: datetime | None = None
