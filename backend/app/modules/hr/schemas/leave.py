import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.modules.hr.schemas.employee import EmployeeRead


class LeaveCreate(BaseModel):
    employee_id: uuid.UUID
    leave_type: str
    from_date: date
    to_date: date
    reason: str | None = None


class LeaveUpdate(BaseModel):
    leave_type: str | None = None
    from_date: date | None = None
    to_date: date | None = None
    reason: str | None = None
    status: str | None = None


class LeaveRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_id: uuid.UUID
    employee: EmployeeRead | None
    leave_type: str
    from_date: date
    to_date: date
    days: int
    reason: str | None
    status: str
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
