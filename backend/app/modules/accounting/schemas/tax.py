import uuid
from datetime import date

from pydantic import BaseModel, Field

# ── Tax Configuration ──────────────────────────────────────────────────────────

class TaxConfigCreate(BaseModel):
    tax_type: str = Field(..., description="vat | paye | withholding | consumption | corporate | personal_income")
    name: str = Field(..., description="Display name for the tax type")
    rate: float = Field(..., ge=0, description="Tax rate (e.g., 18.00 for 18%)")
    rate_type: str = Field(default="percentage", description="percentage | fixed")
    min_threshold: float = Field(default=0, ge=0)
    max_threshold: float | None = Field(default=None, ge=0)
    description: str | None = None
    effective_from: date
    effective_to: date | None = None


class TaxConfigUpdate(BaseModel):
    name: str | None = None
    rate: float | None = Field(default=None, ge=0)
    min_threshold: float | None = Field(default=None, ge=0)
    max_threshold: float | None = None
    description: str | None = None
    is_active: bool | None = None
    effective_to: date | None = None


class TaxConfigRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    tax_type: str
    name: str
    rate: float
    rate_type: str
    min_threshold: float
    max_threshold: float | None
    description: str | None
    is_active: bool
    effective_from: date
    effective_to: date | None

    model_config = {"from_attributes": True}


# ── Tax Calculation ────────────────────────────────────────────────────────────

class TaxCalculationCreate(BaseModel):
    calculation_type: str
    reference_type: str
    reference_id: str | None = None
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM format")
    taxable_amount: float = Field(..., ge=0)
    tax_rate: float = Field(..., ge=0)
    tax_amount: float = Field(..., ge=0)
    description: str | None = None


class TaxCalculationRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    calculation_type: str
    reference_type: str
    reference_id: str | None
    period: str
    taxable_amount: float
    tax_rate: float
    tax_amount: float
    status: str
    description: str | None
    paid_at: date | None

    model_config = {"from_attributes": True}


# ── Tax Payment ────────────────────────────────────────────────────────────────

class TaxPaymentCreate(BaseModel):
    tax_type: str
    period: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    amount: float = Field(..., gt=0)
    payment_date: date
    payment_method: str = Field(..., description="bank_transfer | mobile_money | cash")
    notes: str | None = None


class TaxPaymentRead(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    payment_reference: str
    tax_type: str
    period: str
    amount: float
    payment_date: date
    payment_method: str
    status: str
    notes: str | None
    confirmed_at: date | None

    model_config = {"from_attributes": True}


# ── Rwanda Tax Rates (Reference) ──────────────────────────────────────────────

class RwandaTaxRates(BaseModel):
    """Reference model for Rwanda tax rates as of 2024/2025"""
    vat: float = Field(default=18.0, description="Standard VAT rate")
    paye: list[dict] = Field(default=[
        {"min": 0, "max": 30000, "rate": 0, "description": "First RWF 30,000 - exempt"},
        {"min": 30001, "max": 100000, "rate": 10, "description": "RWF 30,001 - 100,000"},
        {"min": 100001, "max": 200000, "rate": 20, "description": "RWF 100,001 - 200,000"},
        {"min": 200001, "max": 300000, "rate": 30, "description": "RWF 200,001 - 300,000"},
        {"min": 300001, "max": None, "rate": 40, "description": "Above RWF 300,000"},
    ], description="PAYE tax brackets")
    withholding_resident: float = Field(default=15.0, description="Withholding on resident payments")
    withholding_public_institution: float = Field(default=3.0, description="Withholding on public institution payments")
    withholding_imports: float = Field(default=5.0, description="Withholding on imports")
    corporate_income_tax: float = Field(default=30.0, description="Corporate income tax rate")
    pension_employee: float = Field(default=6.0, description="Employee pension contribution")
    pension_employer: float = Field(default=3.0, description="Employer pension contribution")
