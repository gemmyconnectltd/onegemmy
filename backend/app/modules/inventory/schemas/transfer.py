import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TransferItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    product_name: str
    sku: str | None = None
    variant_attributes: dict | None = None
    quantity: float


class StockTransferCreate(BaseModel):
    from_branch_id: uuid.UUID | None = None
    to_branch_id: uuid.UUID | None = None
    notes: str | None = None
    items: list[TransferItemCreate] = []


class StockTransferUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None


class TransferItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    transfer_id: uuid.UUID
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    product_name: str
    sku: str | None
    variant_attributes: dict | None
    quantity: float


class StockTransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    transfer_number: str
    from_branch_id: uuid.UUID | None
    to_branch_id: uuid.UUID | None
    status: str
    notes: str | None
    created_by: uuid.UUID | None
    completed_at: datetime | None = None
    from_branch_name: str | None = None
    to_branch_name: str | None = None
    items: list[TransferItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
