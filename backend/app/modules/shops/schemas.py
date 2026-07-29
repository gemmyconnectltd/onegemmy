import uuid

from pydantic import BaseModel, ConfigDict


class ShopCreate(BaseModel):
    name: str
    location: str | None = None
    status: str = "active"


class ShopUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    status: str | None = None


class ShopRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    location: str | None
    status: str
    created_at: str | None = None
    updated_at: str | None = None
