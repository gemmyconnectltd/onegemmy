import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CustomerCreate(BaseModel):
    credit_daily_limit: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    customer_type: str = "individual"
    tin: str | None = Field(default=None, max_length=50)
    is_active: bool = True


class CustomerCreateStrict(CustomerCreate):
    """A customer entered by hand (not imported) must carry a TIN, individual or business: receipts and invoices cite it."""
    tin: str = Field(min_length=3, max_length=50)

    @field_validator("tin")
    @classmethod
    def tin_is_filled(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Enter the customer's TIN")
        return value


class CustomerBulkCreate(BaseModel):
    items: list[CustomerCreate]


class CustomerBulkResult(BaseModel):
    created: int
    skipped: int
    failed: int
    errors: list[str] = []


class CustomerUpdate(BaseModel):
    credit_daily_limit: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    customer_type: str | None = None
    is_active: bool | None = None
    tin: str | None = Field(default=None, max_length=50)

    @field_validator("tin")
    @classmethod
    def tin_not_blanked(cls, value: str | None) -> str | None:
        if value is not None and len(value.strip()) < 3:
            raise ValueError("A customer's TIN can't be cleared")
        return value.strip() if value else value


class CustomerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    credit_daily_limit: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    name: str
    email: str | None
    phone: str | None
    address: str | None
    customer_type: str
    tin: str | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None
