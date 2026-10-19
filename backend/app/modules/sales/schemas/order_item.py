import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class OrderItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    product_name: str
    sku: str | None = None
    variant_attributes: dict | None = None
    unit_price: float = Field(ge=0, allow_inf_nan=False)
    quantity: float = Field(default=1, gt=0, allow_inf_nan=False)
    discount: float = Field(default=0, ge=0, allow_inf_nan=False)
    serial_ids: list[uuid.UUID] | None = None

    @model_validator(mode="after")
    def compute_line_total(self):
        self.line_total = round((self.unit_price * self.quantity) - self.discount, 2)
        if self.line_total < 0:
            raise ValueError("The line discount cannot exceed its value")
        return self

    line_total: float = 0


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    product_name: str
    sku: str | None
    variant_attributes: dict | None
    unit_price: float
    quantity: float
    discount: float
    line_total: float
    cost_at_sale: float | None = None
    created_at: datetime | None = None
