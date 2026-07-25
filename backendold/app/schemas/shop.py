from pydantic import BaseModel
from typing import Optional
from app.schemas.common import TimestampMixin


class ShopCreate(BaseModel):
    name: str
    location: Optional[str] = None


class ShopUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = None


class ShopResponse(ShopCreate, TimestampMixin):
    id: int
    company_id: int
    status: str = "active"

    class Config:
        from_attributes = True
