from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.schemas.common import TimestampMixin


class DealCreate(BaseModel):
    title: str
    value: float
    stage: Optional[str] = "lead"
    probability: Optional[int] = 0
    lead_id: Optional[int] = None
    notes: Optional[str] = None


class DealUpdate(BaseModel):
    title: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None
    probability: Optional[int] = None
    notes: Optional[str] = None


class DealResponse(TimestampMixin):
    id: int
    title: str
    value: float
    stage: str
    probability: int
    lead_id: Optional[int] = None
    owner_id: int
    notes: Optional[str] = None
    closed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
