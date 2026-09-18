import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class SupplierBillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    purchase_order_id: uuid.UUID
    supplier_id: uuid.UUID | None
    amount: float
    amount_paid: float
    status: str
    bill_date: date
    po_reference: str | None = None
    supplier_name: str | None = None
    balance: float = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SupplierPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_method: str | None = None


class SupplierPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    bill_id: uuid.UUID
    amount: float
    payment_method: str | None
    paid_at: datetime
    created_at: datetime | None = None
