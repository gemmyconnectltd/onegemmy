import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.sales.schemas.customer import CustomerRead
from app.modules.sales.schemas.order_item import OrderItemCreate, OrderItemRead


class OrderCreate(BaseModel):
    customer_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    status: str = "Pending"
    discount: float = 0
    tax: float = 0
    notes: str | None = None
    client_order_id: str | None = None
    items: list[OrderItemCreate] = []


class OrderUpdate(BaseModel):
    customer_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    status: str | None = None
    discount: float | None = None
    tax: float | None = None
    notes: str | None = None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    order_number: str
    customer_id: uuid.UUID | None
    deal_id: uuid.UUID | None
    branch_id: uuid.UUID | None
    created_by: uuid.UUID | None
    status: str
    subtotal: float
    discount: float
    tax: float
    total: float
    notes: str | None
    ordered_at: datetime | None = None
    customer: CustomerRead | None = None
    items: list[OrderItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
