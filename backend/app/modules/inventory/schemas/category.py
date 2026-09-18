import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CategoryTemplateGroup(BaseModel):
    name: str
    items: list[str]


class CategoryTemplateRead(BaseModel):
    id: str
    name: str
    industry: str
    groups: list[CategoryTemplateGroup]


class CategoryTemplatesRead(BaseModel):
    tenant_industry: str | None
    existing: list[str]
    templates: list[CategoryTemplateRead]


class CategoryImportRequest(BaseModel):
    names: list[str]


class CategoryImportResult(BaseModel):
    created: list[CategoryRead]
    skipped: list[str]
