import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.shared.schemas import TrimmedModel


class RoleCreate(TrimmedModel):
    name: str
    description: str | None = None


class RoleUpdate(TrimmedModel):
    name: str | None = None
    description: str | None = None


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    # Filled in from the built-in catalogue: where the role sits in pickers. Informational only; it grants nothing.
    department: str | None = None
    built_in: bool = False
    created_at: datetime
    updated_at: datetime


class RolePermissionAssign(BaseModel):
    permission_ids: list[uuid.UUID]
