import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TargetCreate(BaseModel):
    name: str
    target_value: float
    achieved_value: float = 0
    unit: str = "number"
    period: str
    assigned_to: uuid.UUID | None = None


class TargetUpdate(BaseModel):
    name: str | None = None
    target_value: float | None = None
    achieved_value: float | None = None
    unit: str | None = None
    period: str | None = None
    assigned_to: uuid.UUID | None = None


class TargetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    target_value: float
    achieved_value: float
    unit: str
    period: str
    assigned_to: uuid.UUID | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
