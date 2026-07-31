import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UnitCreate(BaseModel):
    name: str
    abbreviation: str | None = None


class UnitUpdate(BaseModel):
    name: str | None = None
    abbreviation: str | None = None


class UnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    abbreviation: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
