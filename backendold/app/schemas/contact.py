from pydantic import BaseModel
from typing import Optional
from app.schemas.common import TimestampMixin


class ContactCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = "active"
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ContactResponse(TimestampMixin):
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    status: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True
