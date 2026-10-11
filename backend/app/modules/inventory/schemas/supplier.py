import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SupplierCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool = True
    lead_time_days: int | None = Field(default=None, ge=0, le=365)


class SupplierBulkCreate(BaseModel):
    items: list[SupplierCreate]


class SupplierBulkResult(BaseModel):
    created: int
    skipped: int
    failed: int
    errors: list[str] = []


class SupplierUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None
    lead_time_days: int | None = Field(default=None, ge=0, le=365)


class SupplierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    address: str | None
    is_active: bool
    lead_time_days: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
