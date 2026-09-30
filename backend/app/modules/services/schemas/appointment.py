import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.hr.schemas import EmployeeRead
from app.modules.sales.schemas import CustomerRead
from app.modules.tenants.schemas import BranchRead


class AppointmentServiceInput(BaseModel):
    service_id: uuid.UUID
    employee_id: uuid.UUID | None = None


class AppointmentCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    customer_name: str
    customer_phone: str | None = None
    employee_id: uuid.UUID | None = None
    scheduled_start: datetime
    services: list[AppointmentServiceInput] = Field(min_length=1)
    notes: str | None = None


class AppointmentUpdate(BaseModel):
    branch_id: uuid.UUID | None = None
    employee_id: uuid.UUID | None = None
    status: str | None = None
    scheduled_start: datetime | None = None
    notes: str | None = None


class AppointmentServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    service_id: uuid.UUID | None
    service_name: str
    employee_id: uuid.UUID | None
    employee: EmployeeRead | None = None
    duration_minutes: int
    price: float


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID | None
    branch: BranchRead | None = None
    customer_id: uuid.UUID | None
    customer_name: str
    customer_phone: str | None
    customer: CustomerRead | None = None
    employee_id: uuid.UUID | None
    employee: EmployeeRead | None = None
    status: str
    scheduled_start: datetime
    scheduled_end: datetime
    notes: str | None
    services: list[AppointmentServiceRead] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
