import uuid
from datetime import datetime

from pydantic import BaseModel


class GenerateVariantsRequest(BaseModel):
    attributes: dict[str, list[str]]
    base_price: float = 0
    base_cost: float = 0
    price_deltas: dict[str, float] | None = None


class GenerateVariantsResult(BaseModel):
    created: int
    skipped: int
    variants: list[uuid.UUID] = []


class SizeSelloutLine(BaseModel):
    size: str
    qty_sold: float
    revenue: float


class SizeSelloutReport(BaseModel):
    attribute_key: str = "Size"
    items: list[SizeSelloutLine] = []


class MarkdownLine(BaseModel):
    id: uuid.UUID
    kind: str  # "product" | "variant"
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    name: str
    sku: str | None = None
    barcode: str | None = None
    price: float
    promo_price: float
    promo_ends_at: datetime | None = None
    savings: float


class MarkdownReport(BaseModel):
    items: list[MarkdownLine] = []
    total: int = 0
