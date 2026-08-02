import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.modules.hr.schemas.employee import EmployeeRead


class PayrollCreate(BaseModel):
    employee_id: uuid.UUID
    period: str  # YYYY-MM
    base_salary: float = 0
    bonus: float = 0
    deductions: float = 0


class PayrollUpdate(BaseModel):
    base_salary: float | None = None
    bonus: float | None = None
    deductions: float | None = None
    status: str | None = None


class PayrollRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_id: uuid.UUID
    employee: EmployeeRead | None
    period: str
    base_salary: float
    bonus: float
    deductions: float
    net_pay: float
    status: str
    paid_at: datetime | None
    created_at: datetime | None = None
    updated_at: datetime | None = None
