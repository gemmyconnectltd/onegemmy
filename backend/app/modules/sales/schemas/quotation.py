import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.sales.schemas.customer import CustomerRead
from app.modules.sales.schemas.order_item import OrderItemCreate


class QuotationCreate(BaseModel):
    customer_id: uuid.UUID | None = None
    salesperson_id: uuid.UUID | None = None
    branch_id: uuid.UUID | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    discount: float = Field(default=0, ge=0, allow_inf_nan=False)
    notes: str | None = Field(default=None, max_length=2000)
    terms: str | None = Field(default=None, max_length=2000)
    items: list[OrderItemCreate] = Field(min_length=1, max_length=200)


class QuotationUpdate(BaseModel):
    customer_id: uuid.UUID | None = None
    salesperson_id: uuid.UUID | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    discount: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    notes: str | None = Field(default=None, max_length=2000)
    terms: str | None = Field(default=None, max_length=2000)
    items: list[OrderItemCreate] | None = Field(default=None, min_length=1, max_length=200)


class QuotationReject(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class QuotationItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID | None
    variant_id: uuid.UUID | None
    product_name: str
    sku: str | None
    variant_attributes: dict | None
    unit_price: float
    quantity: float
    discount: float
    line_total: float


class QuotationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quote_number: str
    status: str
    customer_id: uuid.UUID | None
    customer: CustomerRead | None = None
    salesperson_id: uuid.UUID | None
    salesperson_name: str | None = None
    branch_id: uuid.UUID | None
    created_by: uuid.UUID | None
    issue_date: date
    expiry_date: date | None
    subtotal: float
    discount: float
    tax: float
    total: float
    notes: str | None
    terms: str | None
    sent_at: datetime | None
    decided_at: datetime | None
    decision_reason: str | None
    converted_order_id: uuid.UUID | None
    converted_order_number: str | None = None
    items: list[QuotationItemRead] = []
    created_at: datetime | None = None
