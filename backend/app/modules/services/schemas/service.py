import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.services.schemas.category import ServiceCategoryRead


class ServiceCreate(BaseModel):
    name: str
    description: str | None = None
    price: float = 0
    cost: float = 0
    duration_minutes: int = 30
    image_url: str | None = None
    is_active: bool = True
    category_id: uuid.UUID | None = None


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = None
    cost: float | None = None
    duration_minutes: int | None = None
    image_url: str | None = None
    is_active: bool | None = None
    category_id: uuid.UUID | None = None


class ServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    price: float
    cost: float
    duration_minutes: int
    image_url: str | None
    is_active: bool
    category_id: uuid.UUID | None
    category: ServiceCategoryRead | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ServiceTemplateItem(BaseModel):
    name: str
    duration_minutes: int


class ServiceTemplateGroup(BaseModel):
    name: str
    items: list[ServiceTemplateItem]


class ServiceTemplateRead(BaseModel):
    id: str
    name: str
    industry: str
    groups: list[ServiceTemplateGroup]


class ServiceTemplatesRead(BaseModel):
    tenant_industry: str | None
    existing: list[str]
    templates: list[ServiceTemplateRead]


class ServiceImportItem(BaseModel):
    name: str
    category_name: str
    duration_minutes: int = 30


class ServiceImportRequest(BaseModel):
    items: list[ServiceImportItem]


class ServiceImportResult(BaseModel):
    created: list[ServiceRead]
    skipped: list[str]
