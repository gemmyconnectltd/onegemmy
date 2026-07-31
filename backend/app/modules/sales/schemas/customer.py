import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CustomerCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    customer_type: str = "individual"
    is_active: bool = True


class CustomerUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    customer_type: str | None = None
    is_active: bool | None = None


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    email: str | None
    phone: str | None
    address: str | None
    customer_type: str
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
