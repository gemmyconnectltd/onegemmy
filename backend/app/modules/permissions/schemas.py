from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PermissionCreate(BaseModel):
    name: str
    description: str | None = None
    resource: str
    action: str


class PermissionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    resource: str | None = None
    action: str | None = None


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    resource: str
    action: str
    created_at: datetime
    updated_at: datetime


class RolePermissionAssign(BaseModel):
    permission_ids: list[UUID]
