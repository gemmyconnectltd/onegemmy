import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PurchaseReturnCreate(BaseModel):
    purchase_order_id: uuid.UUID
    client_reference: str | None = Field(default=None, min_length=3, max_length=50)
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    product_name: str
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    amount: Decimal = Field(default=0, ge=0, max_digits=14, decimal_places=2)
    reason: str = Field(min_length=3, max_length=2000)
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
    currency_code: str | None = None
    base_amount: Decimal | None = None
    refund_base_amount: Decimal | None = None
    amount: float
    reason: str | None
    status: str
    return_date: date
    processed_by: uuid.UUID | None
    po_reference: str | None = None
    supplier_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SupplierRefundInput(BaseModel):
    base_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: str = Field(pattern=r"^(Cash|Bank Transfer|Mobile Money|Card)$")
    reference: str = Field(min_length=3, max_length=50)
