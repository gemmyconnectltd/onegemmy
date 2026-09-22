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
    payment_method: str | None = None
    amount_tendered: float | None = None
    change_due: float | None = None
    ordered_at: datetime | None = None
    items: list[OrderItemCreate] = []


class OrderBulkLine(BaseModel):
    """One line of a CSV order import. Lines sharing the same `order_reference`
    are grouped into a single order (client_order_id), so multi-item orders are
    one reference repeated. `status` defaults to Completed — importing historical
    sales as Completed deducts stock and posts them to accounting exactly like a
    POS sale; use Pending to record rows without touching stock or the ledger."""
    order_reference: str
    customer: str | None = None
    ordered_at: datetime | None = None
    status: str = "Completed"
    payment_method: str | None = None
    notes: str | None = None
    sku: str = ""
    quantity: float = 1
    unit_price: float


class OrderBulkCreate(BaseModel):
    items: list[OrderBulkLine]


class OrderBulkResult(BaseModel):
    created: int
    failed: int
    errors: list[str] = []


class OrderUpdate(BaseModel):
    customer_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    status: str | None = None
    discount: float | None = None
    tax: float | None = None
    notes: str | None = None
    payment_method: str | None = None
    amount_tendered: float | None = None
    change_due: float | None = None


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
    payment_method: str | None = None
    amount_tendered: float | None = None
    change_due: float | None = None
    ordered_at: datetime | None = None
    customer: CustomerRead | None = None
    items: list[OrderItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
