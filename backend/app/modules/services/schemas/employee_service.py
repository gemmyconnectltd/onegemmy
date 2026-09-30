import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.hr.schemas import EmployeeRead
from app.modules.services.schemas.service import ServiceRead


class EmployeeServiceCreate(BaseModel):
    employee_id: uuid.UUID
    service_id: uuid.UUID
    commission_type: str | None = None
    commission_value: float = 0
    duration_override_minutes: int | None = None


class EmployeeServiceUpdate(BaseModel):
    commission_type: str | None = None
    commission_value: float | None = None
    duration_override_minutes: int | None = None


class EmployeeServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    service_id: uuid.UUID
    commission_type: str | None
    commission_value: float
    duration_override_minutes: int | None
    employee: EmployeeRead | None = None
    service: ServiceRead | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
