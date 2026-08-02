import uuid

from pydantic import BaseModel


class ValuationLine(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID | None
    kind: str  # "product" | "variant"
    name: str
    sku: str | None
    category: str | None
    brand: str | None
    unit: str | None
    stock: int
    min_stock: int
    cost: float
    price: float
    cost_value: float
    retail_value: float
    margin: float
    margin_pct: float | None
    status: str  # "out" | "low" | "ok"


class CategoryValuation(BaseModel):
    name: str
    units: int
    cost_value: float
    retail_value: float
    margin: float


class ValuationSummary(BaseModel):
    product_count: int
    line_count: int
    variant_count: int
    total_units: int
    cost_value: float
    retail_value: float
    margin: float
    margin_pct: float | None
    low_stock_count: int
    out_of_stock_count: int


class InventoryValuationReport(BaseModel):
    generated_at: str
    costing_method: str
    summary: ValuationSummary
    categories: list[CategoryValuation]
    lines: list[ValuationLine]
