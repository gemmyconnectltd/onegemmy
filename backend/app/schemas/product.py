from pydantic import BaseModel
from typing import Optional
from app.schemas.common import TimestampMixin


class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: str
    price: float
    cost: float = 0
    stock_quantity: int = 0
    min_stock: int = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    stock_quantity: Optional[int] = None
    min_stock: Optional[int] = None


class ProductResponse(TimestampMixin):
    id: int
    sku: str
    name: str
    description: Optional[str] = None
    category: str
    price: float
    cost: float
    stock_quantity: int
    min_stock: int
    is_active: bool = True

    class Config:
        from_attributes = True
