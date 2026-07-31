import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BrandCreate(BaseModel):
    name: str
    description: str | None = None


class BrandUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class BrandRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
