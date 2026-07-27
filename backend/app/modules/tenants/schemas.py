import uuid

from pydantic import BaseModel, ConfigDict


class TenantCreate(BaseModel):
    name: str
    slug: str
    logo_url: str | None = None
    website: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None


class TenantUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    is_active: bool | None = None
    logo_url: str | None = None
    website: str | None = None
    phone: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    subscription_plan: str | None = None
    subscription_status: str | None = None


class TenantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    is_active: bool
    logo_url: str | None
    website: str | None
    phone: str | None
    address: str | None
    city: str | None
    country: str | None
    subscription_plan: str
    subscription_status: str
    created_at: str | None = None
    updated_at: str | None = None
