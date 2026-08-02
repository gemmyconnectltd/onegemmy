import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class DepartmentRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class EmployeeCreate(BaseModel):
    first_name: str
    last_name: str
    email: str | None = None
    phone: str | None = None
    department_id: uuid.UUID | None = None
    job_title: str | None = None
    employment_status: str = "Active"
    hire_date: date | None = None
    salary: float = 0
    employee_code: str | None = None


class EmployeeUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    department_id: uuid.UUID | None = None
    job_title: str | None = None
    employment_status: str | None = None
    hire_date: date | None = None
    salary: float | None = None


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    employee_code: str
    first_name: str
    last_name: str
    full_name: str
    email: str | None
    phone: str | None
    department_id: uuid.UUID | None
    department: DepartmentRef | None
    job_title: str | None
    employment_status: str
    hire_date: date | None
    salary: float
    created_at: datetime | None = None
    updated_at: datetime | None = None
