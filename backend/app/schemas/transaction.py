from pydantic import BaseModel
from typing import Optional
from app.schemas.common import TimestampMixin


class TransactionCreate(BaseModel):
    description: str
    amount: float
    type: str
    category: str
    reference: Optional[str] = None


class TransactionResponse(TimestampMixin):
    id: int
    description: str
    amount: float
    type: str
    category: str
    reference: Optional[str] = None

    class Config:
        from_attributes = True
