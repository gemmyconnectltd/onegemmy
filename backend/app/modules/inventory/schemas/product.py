import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.inventory.schemas.brand import BrandRead
from app.modules.inventory.schemas.category import CategoryRead
from app.modules.inventory.schemas.supplier import SupplierRead
from app.modules.inventory.schemas.unit import UnitRead


class ProductCreate(BaseModel):
    name: str
    sku: str | None = None
    description: str | None = None
    image_url: str | None = None
    price: float = 0
    cost: float = 0
    stock: int = 0
    min_stock: int = 0
    is_active: bool = True
    category_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None


class ProductBulkCreate(BaseModel):
    items: list[ProductCreate]


class ProductBulkResult(BaseModel):
    created: int
    failed: int
    errors: list[str] = []


class ProductUpdate(BaseModel):
    name: str | None = None
    sku: str | None = None
    description: str | None = None
    image_url: str | None = None
    price: float | None = None
    cost: float | None = None
    stock: int | None = None
    min_stock: int | None = None
    is_active: bool | None = None
    category_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None


class RestockRequest(BaseModel):
    qty: int
    mode: str = "restock"  # "restock" | "adjust"
    reason: str | None = None
    notes: str | None = None


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    sku: str | None
    description: str | None
    image_url: str | None
    price: float
    cost: float
    stock: int
    min_stock: int
    is_active: bool
    category_id: uuid.UUID | None
    brand_id: uuid.UUID | None
    unit_id: uuid.UUID | None
    supplier_id: uuid.UUID | None
    category: CategoryRead | None = None
    brand: BrandRead | None = None
    unit: UnitRead | None = None
    supplier: SupplierRead | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
