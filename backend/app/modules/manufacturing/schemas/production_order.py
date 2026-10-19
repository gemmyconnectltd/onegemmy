import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ProductionItemCreate(BaseModel):
    product_id: uuid.UUID | None = None
    product_name: str | None = None
    wastage_quantity: int = Field(default=0, ge=0)
    quantity_required: int = Field(default=1, ge=1)


class ProductionItemUpdate(BaseModel):
    product_id: uuid.UUID | None = None
    product_name: str | None = None
    quantity_required: int | None = Field(default=None, ge=1)


class ProductionItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    production_order_id: uuid.UUID
    product_id: uuid.UUID | None
    product_name: str | None
    wastage_quantity: int = 0
    quantity_required: int


class ProductionOrderCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    product_name: str | None = None
    quantity: int = Field(default=1, ge=1)
    status: str = "Draft"
    scheduled_date: date | None = None
    notes: str | None = None
    items: list[ProductionItemCreate] = []


class ProductionOrderUpdate(BaseModel):
    branch_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    product_name: str | None = None
    quantity: int | None = Field(default=None, ge=1)
    status: str | None = None
    scheduled_date: date | None = None
    notes: str | None = None
    items: list[ProductionItemCreate] | None = None


class ProductionOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID | None = None
    order_number: str
    product_id: uuid.UUID | None
    product_name: str | None
    quantity: int
    status: str
    scheduled_date: date | None
    completed_at: datetime | None
    notes: str | None
    items: list[ProductionItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
