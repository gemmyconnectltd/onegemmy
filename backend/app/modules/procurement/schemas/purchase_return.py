import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class PurchaseReturnCreate(BaseModel):
    purchase_order_id: uuid.UUID
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    product_name: str
    quantity: float = Field(gt=0)
    amount: float = Field(default=0, ge=0)
    reason: str | None = None
    return_date: date | None = None


class PurchaseReturnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    purchase_order_id: uuid.UUID
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    product_name: str
    quantity: float
    amount: float
    reason: str | None
    status: str
    return_date: date
    processed_by: uuid.UUID | None
    po_reference: str | None = None
    supplier_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
