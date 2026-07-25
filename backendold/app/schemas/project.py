from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.common import TimestampMixin


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    client: Optional[str] = None
    status: Optional[str] = "planning"
    progress: Optional[int] = 0
    budget: Optional[float] = 0
    deadline: Optional[datetime] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    client: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None
    budget: Optional[float] = None
    deadline: Optional[datetime] = None


class ProjectResponse(TimestampMixin):
    id: int
    name: str
    description: Optional[str] = None
    client: Optional[str] = None
    status: str
    progress: int
    budget: float
    deadline: Optional[datetime] = None
    owner_id: int

    class Config:
        from_attributes = True
