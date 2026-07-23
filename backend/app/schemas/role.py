from pydantic import BaseModel, field_validator
from typing import Optional, List
from app.schemas.common import TimestampMixin


class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#64748B"


class RoleCreate(RoleBase):
    permissions: List[str] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    permissions: Optional[List[str]] = None


class RoleResponse(RoleBase, TimestampMixin):
    id: int
    company_id: Optional[int] = None
    is_system: bool = False
    permissions: List[str] = []

    @field_validator("permissions", mode="before")
    @classmethod
    def extract_permission_ids(cls, v):
        if v and hasattr(v[0], "id"):
            return [p.id for p in v]
        return v

    class Config:
        from_attributes = True
