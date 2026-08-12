import uuid

from pydantic import BaseModel, ConfigDict, model_validator
from datetime import datetime


class RepairJobPartCreate(BaseModel):
    product_id: uuid.UUID | None = None
    part_name: str
    quantity: float = 1
    unit_cost: float = 0

    @model_validator(mode="after")
    def compute_line_total(self):
        self.line_total = round(self.unit_cost * self.quantity, 2)
        return self

    line_total: float = 0


class RepairJobPartRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    product_id: uuid.UUID | None
    part_name: str
    quantity: float
    unit_cost: float
    line_total: float
    created_at: datetime | None = None


class RepairJobCreate(BaseModel):
    device_type: str
    device_brand: str | None = None
    device_model: str | None = None
    serial_number: str | None = None
    imei: str | None = None
    device_condition: str | None = None
    reported_issue: str
    estimated_cost: float = 0
    promised_at: datetime | None = None
    customer_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None
    parts: list[RepairJobPartCreate] = []


class RepairJobUpdate(BaseModel):
    status: str | None = None
    diagnosis: str | None = None
    resolution_notes: str | None = None
    estimated_cost: float | None = None
    final_cost: float | None = None
    promised_at: datetime | None = None
    completed_at: datetime | None = None
    assigned_to: uuid.UUID | None = None
    parts: list[RepairJobPartCreate] | None = None


class RepairJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    job_number: str
    status: str
    device_type: str
    device_brand: str | None
    device_model: str | None
    serial_number: str | None
    imei: str | None
    device_condition: str | None
    reported_issue: str
    diagnosis: str | None
    resolution_notes: str | None
    estimated_cost: float
    final_cost: float
    received_at: datetime | None = None
    promised_at: datetime | None = None
    completed_at: datetime | None = None
    customer_id: uuid.UUID | None
    assigned_to: uuid.UUID | None
    customer_name: str | None = None
    technician_name: str | None = None
    parts: list[RepairJobPartRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
