import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BranchCreate(BaseModel):
    name: str
    location: str | None = None
    status: str = "active"


class BranchUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    status: str | None = None


class BranchRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    location: str | None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
