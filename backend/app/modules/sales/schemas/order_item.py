import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator


class OrderItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    product_name: str
    sku: str | None = None
    unit_price: float
    quantity: int = 1
    discount: float = 0

    @model_validator(mode="after")
    def compute_line_total(self):
        self.line_total = round((self.unit_price * self.quantity) - self.discount, 2)
        return self

    line_total: float = 0


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    product_id: uuid.UUID | None
    product_name: str
    sku: str | None
    unit_price: float
    quantity: int
    discount: float
    line_total: float
    created_at: datetime | None = None
