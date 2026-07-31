import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator


class ReturnItemCreate(BaseModel):
    order_item_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    product_name: str
    quantity: int = 1
    refund_per_unit: float

    @model_validator(mode="after")
    def compute_line_refund(self):
        self.line_refund = round(self.refund_per_unit * self.quantity, 2)
        return self

    line_refund: float = 0


class ReturnItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    return_id: uuid.UUID
    order_item_id: uuid.UUID | None
    product_id: uuid.UUID | None
    product_name: str
    quantity: int
    refund_per_unit: float
    line_refund: float
    created_at: datetime | None = None
