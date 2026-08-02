import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.modules.hr.schemas.employee import EmployeeRead


class AttendanceCreate(BaseModel):
    employee_id: uuid.UUID
    date: date
    check_in: str | None = None
    check_out: str | None = None
    status: str = "Present"


class AttendanceUpdate(BaseModel):
    check_in: str | None = None
    check_out: str | None = None
    status: str | None = None


class AttendanceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_id: uuid.UUID
    employee: EmployeeRead | None
    date: date
    check_in: str | None
    check_out: str | None
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
