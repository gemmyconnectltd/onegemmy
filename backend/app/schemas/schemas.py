from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# Auth schemas
class UserCreate(BaseModel):
    email: str
    name: str
    password: str
    role: Optional[str] = "employee"


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


# Product schemas
class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: str
    price: float
    cost: float = 0
    stock_quantity: int = 0
    min_stock: int = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    stock_quantity: Optional[int] = None
    min_stock: Optional[int] = None


class ProductResponse(BaseModel):
    id: int
    sku: str
    name: str
    description: Optional[str]
    category: str
    price: float
    cost: float
    stock_quantity: int
    min_stock: int
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Lead schemas
class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class LeadResponse(BaseModel):
    id: int
    name: str
    email: Optional[str]
    phone: Optional[str]
    company: Optional[str]
    source: Optional[str]
    notes: Optional[str]
    is_converted: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Deal schemas
class DealCreate(BaseModel):
    title: str
    value: float
    stage: Optional[str] = "lead"
    probability: Optional[int] = 0
    lead_id: Optional[int] = None
    notes: Optional[str] = None


class DealUpdate(BaseModel):
    title: Optional[str] = None
    value: Optional[float] = None
    stage: Optional[str] = None
    probability: Optional[int] = None
    notes: Optional[str] = None


class DealResponse(BaseModel):
    id: int
    title: str
    value: float
    stage: str
    probability: int
    lead_id: Optional[int]
    owner_id: int
    notes: Optional[str]
    closed_at: Optional[datetime]
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Contact schemas
class ContactCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = "active"
    notes: Optional[str] = None


class ContactResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str]
    company: Optional[str]
    status: str
    notes: Optional[str]
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Transaction schemas
class TransactionCreate(BaseModel):
    description: str
    amount: float
    type: str
    category: str
    reference: Optional[str] = None


class TransactionResponse(BaseModel):
    id: int
    description: str
    amount: float
    type: str
    category: str
    reference: Optional[str]
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Project schemas
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    client: Optional[str] = None
    status: Optional[str] = "planning"
    progress: Optional[int] = 0
    budget: Optional[float] = 0
    deadline: Optional[datetime] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    client: Optional[str]
    status: str
    progress: int
    budget: float
    deadline: Optional[datetime]
    owner_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Employee schemas
class EmployeeCreate(BaseModel):
    name: str
    email: str
    role: str
    department: str
    status: Optional[str] = "active"
    phone: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    department: str
    status: str
    phone: Optional[str]
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Dashboard schema
class DashboardStats(BaseModel):
    total_revenue: float
    total_expenses: float
    net_profit: float
    total_products: int
    total_contacts: int
    total_deals: int
    total_employees: int
