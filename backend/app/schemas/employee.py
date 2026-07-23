from pydantic import BaseModel
from typing import Optional
from app.schemas.common import TimestampMixin


class EmployeeCreate(BaseModel):
    name: str
    email: str
    role: str
    department: str
    status: Optional[str] = "active"
    phone: Optional[str] = None


class EmployeeResponse(TimestampMixin):
    id: int
    name: str
    email: str
    role: str
    department: str
    status: str
    phone: Optional[str] = None

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_revenue: float
    total_expenses: float
    net_profit: float
    total_products: int
    total_contacts: int
    total_deals: int
    total_employees: int
