import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SerialCreateItem(BaseModel):
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    serial_number: str
    imei: str | None = None
    warranty_months: int = 0
    purchase_price: float = 0
    notes: str | None = None


class SerialBulkCreate(BaseModel):
    items: list[SerialCreateItem]


class SerialUpdate(BaseModel):
    imei: str | None = None
    warranty_months: int | None = None
    notes: str | None = None


class SerialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    product_id: uuid.UUID
    variant_id: uuid.UUID | None
    serial_number: str
    imei: str | None
    status: str
    warranty_months: int
    warranty_expires_at: datetime | None = None
    purchase_price: float
    order_item_id: uuid.UUID | None = None
    notes: str | None = None
    product_name: str | None = None
    variant_attributes: dict | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class WarrantyClaimCreate(BaseModel):
    serial_id: uuid.UUID
    order_id: uuid.UUID | None = None
    issue_description: str


class WarrantyClaimUpdate(BaseModel):
    status: str | None = None
    resolution_notes: str | None = None


class WarrantyClaimRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    claim_number: str
    serial_id: uuid.UUID
    order_id: uuid.UUID | None
    status: str
    issue_description: str
    resolution_notes: str | None
    submitted_at: datetime | None = None
    completed_at: datetime | None = None
    serial_number: str | None = None
    product_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
