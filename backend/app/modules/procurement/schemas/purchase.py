import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.inventory.schemas.supplier import SupplierRead


class PurchaseItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    product_name: str
    sku: str | None = None
    variant_attributes: dict | None = None
    unit_cost: float = Field(ge=0)
    quantity: float = Field(default=1, gt=0)


class PurchaseItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    product_name: str
    sku: str | None
    variant_attributes: dict | None
    unit_cost: float
    quantity: float
    line_total: float


class PurchaseCreate(BaseModel):
    supplier_id: uuid.UUID | None = None
    expected_date: date | None = None
    status: str = "Draft"
    discount: float = Field(default=0, ge=0)
    tax: float = Field(default=0, ge=0)
    notes: str | None = None
    items: list[PurchaseItemCreate] = Field(min_length=1)


class PurchaseUpdate(BaseModel):
    supplier_id: uuid.UUID | None = None
    expected_date: date | None = None
    discount: float | None = Field(default=None, ge=0)
    tax: float | None = Field(default=None, ge=0)
    notes: str | None = None


class PurchaseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    status: str
    subtotal: float
    discount: float
    tax: float
    total: float
    notes: str | None
    expected_date: date | None
    received_at: datetime | None
    supplier_id: uuid.UUID | None
    created_by: uuid.UUID | None
    supplier: SupplierRead | None = None
    items: list[PurchaseItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
