import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BomItemCreate(BaseModel):
    component_product_id: uuid.UUID | None = None
    component_product_name: str | None = None
    quantity_required: int = Field(default=1, ge=1)


class BomItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    bom_id: uuid.UUID
    component_product_id: uuid.UUID | None
    component_product_name: str | None
    quantity_required: int


class BomCreate(BaseModel):
    name: str
    product_id: uuid.UUID | None = None
    product_name: str | None = None
    notes: str | None = None
    items: list[BomItemCreate] = []


class BomUpdate(BaseModel):
    name: str | None = None
    product_id: uuid.UUID | None = None
    product_name: str | None = None
    notes: str | None = None
    items: list[BomItemCreate] | None = None


class BomRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    product_id: uuid.UUID | None
    product_name: str | None
    notes: str | None
    items: list[BomItemRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
