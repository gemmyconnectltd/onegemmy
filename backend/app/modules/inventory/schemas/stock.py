import uuid

from pydantic import BaseModel


class LowStockLine(BaseModel):
    id: uuid.UUID
    kind: str  # "product" | "variant"
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    name: str
    sku: str | None = None
    barcode: str | None = None
    stock: float
    min_stock: float
    suggested_qty: float


class LowStockReport(BaseModel):
    items: list[LowStockLine] = []
    total: int = 0
