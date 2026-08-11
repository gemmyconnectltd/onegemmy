import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.inventory.schemas.brand import BrandRead
from app.modules.inventory.schemas.category import CategoryRead
from app.modules.inventory.schemas.supplier import SupplierRead
from app.modules.inventory.schemas.unit import UnitRead


class VariantCreate(BaseModel):
    sku: str | None = None
    barcode: str | None = None
    attributes: dict = {}
    price: float = 0
    cost: float = 0
    stock: float = 0
    min_stock: float = 0
    is_active: bool = True
    promo_price: float | None = None
    promo_ends_at: datetime | None = None


class VariantUpdate(BaseModel):
    sku: str | None = None
    barcode: str | None = None
    attributes: dict | None = None
    price: float | None = None
    cost: float | None = None
    stock: float | None = None
    min_stock: float | None = None
    is_active: bool | None = None
    promo_price: float | None = None
    promo_ends_at: datetime | None = None


class VariantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    sku: str | None
    barcode: str | None = None
    attributes: dict
    price: float
    cost: float
    stock: float
    min_stock: float
    image_url: str | None = None
    is_active: bool
    promo_price: float | None = None
    promo_ends_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class VariantListRead(VariantRead):
    product_name: str | None = None
    product_sku: str | None = None


class ProductCreate(BaseModel):
    name: str
    sku: str | None = None
    barcode: str | None = None
    description: str | None = None
    image_url: str | None = None
    price: float = 0
    cost: float = 0
    stock: float = 0
    min_stock: float = 0
    is_active: bool = True
    has_variants: bool = False
    tracks_serials: bool = False
    sale_by_weight: bool = False
    conversion_factor: float = 1
    promo_price: float | None = None
    promo_ends_at: datetime | None = None
    category_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    sale_unit_id: uuid.UUID | None = None
    purchase_unit_id: uuid.UUID | None = None
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
    barcode: str | None = None
    description: str | None = None
    image_url: str | None = None
    price: float | None = None
    cost: float | None = None
    stock: float | None = None
    min_stock: float | None = None
    is_active: bool | None = None
    has_variants: bool | None = None
    tracks_serials: bool | None = None
    sale_by_weight: bool | None = None
    conversion_factor: float | None = None
    promo_price: float | None = None
    promo_ends_at: datetime | None = None
    category_id: uuid.UUID | None = None
    brand_id: uuid.UUID | None = None
    unit_id: uuid.UUID | None = None
    sale_unit_id: uuid.UUID | None = None
    purchase_unit_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None


class RestockRequest(BaseModel):
    qty: float
    mode: str = "restock"  # "restock" | "adjust"
    reason: str | None = None
    notes: str | None = None


class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    sku: str | None
    barcode: str | None = None
    description: str | None
    image_url: str | None
    price: float
    cost: float
    stock: float
    min_stock: float
    is_active: bool
    has_variants: bool
    tracks_serials: bool = False
    sale_by_weight: bool = False
    conversion_factor: float = 1
    promo_price: float | None = None
    promo_ends_at: datetime | None = None
    category_id: uuid.UUID | None
    brand_id: uuid.UUID | None
    unit_id: uuid.UUID | None
    sale_unit_id: uuid.UUID | None
    purchase_unit_id: uuid.UUID | None
    supplier_id: uuid.UUID | None
    category: CategoryRead | None = None
    brand: BrandRead | None = None
    unit: UnitRead | None = None
    sale_unit: UnitRead | None = None
    purchase_unit: UnitRead | None = None
    supplier: SupplierRead | None = None
    variants: list[VariantRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
