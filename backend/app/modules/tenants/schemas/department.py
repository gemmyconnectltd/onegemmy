import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DepartmentCreate(BaseModel):
    name: str
    description: str | None = None
    tenant_id: uuid.UUID | None = None  # superadmin-only override; ignored for regular tenant users


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DepartmentTemplateGroup(BaseModel):
    name: str
    items: list[str]


class DepartmentTemplateRead(BaseModel):
    id: str
    name: str
    industry: str
    groups: list[DepartmentTemplateGroup]


class DepartmentTemplatesRead(BaseModel):
    tenant_industry: str | None
    existing: list[str]
    templates: list[DepartmentTemplateRead]


class DepartmentImportRequest(BaseModel):
    names: list[str]


class DepartmentImportResult(BaseModel):
    created: list[DepartmentRead]
    skipped: list[str]
