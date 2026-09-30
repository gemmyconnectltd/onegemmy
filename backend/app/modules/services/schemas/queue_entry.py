import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.hr.schemas import EmployeeRead
from app.modules.sales.schemas import CustomerRead
from app.modules.tenants.schemas import BranchRead


class QueueEntryCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    customer_id: uuid.UUID | None = None
    customer_name: str
    service_id: uuid.UUID
    employee_id: uuid.UUID | None = None
    notes: str | None = None
    start_now: bool = False


class QueueEntryUpdate(BaseModel):
    status: str | None = None
    employee_id: uuid.UUID | None = None
    notes: str | None = None


class QueueEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID | None
    branch: BranchRead | None = None
    customer_id: uuid.UUID | None
    customer_name: str
    customer: CustomerRead | None = None
    service_id: uuid.UUID | None
    service_name: str
    employee_id: uuid.UUID | None
    employee: EmployeeRead | None = None
    status: str
    checked_in_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    notes: str | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
