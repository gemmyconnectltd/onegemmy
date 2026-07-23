from pydantic import BaseModel
from typing import Optional, List
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


class RevenuePoint(BaseModel):
    date: str
    revenue: float
    expenses: float


class DealStageCount(BaseModel):
    stage: str
    count: int
    value: float


class TopProduct(BaseModel):
    id: int
    name: str
    sku: str
    category: str
    price: float
    stock_quantity: int
    stock_value: float


class LowStockProduct(BaseModel):
    id: int
    name: str
    sku: str
    stock_quantity: int
    min_stock: int
    category: str


class ExpenseByCategory(BaseModel):
    category: str
    amount: float


class ActivityItem(BaseModel):
    id: int
    type: str
    title: str
    detail: str
    amount: Optional[float] = None
    timestamp: str


class DashboardResponse(BaseModel):
    stats: DashboardStats
    revenue_chart: List[RevenuePoint]
    deal_pipeline: List[DealStageCount]
    top_products: List[TopProduct]
    low_stock: List[LowStockProduct]
    expense_breakdown: List[ExpenseByCategory]
    recent_activity: List[ActivityItem]
