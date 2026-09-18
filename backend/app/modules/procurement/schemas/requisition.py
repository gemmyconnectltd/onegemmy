import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RequisitionCreate(BaseModel):
    item_name: str
    quantity: float = Field(default=1, gt=0)
    department_id: uuid.UUID | None = None
    notes: str | None = None


class RequisitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    reference: str
    item_name: str
    quantity: float
    status: str
    notes: str | None
    department_id: uuid.UUID | None
    requested_by: uuid.UUID | None
    decided_by: uuid.UUID | None
    decided_at: datetime | None
    department_name: str | None = None
    requested_by_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
