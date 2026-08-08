"""Rwanda Tax Calculation Service

Implements Rwanda Revenue Authority (RRA) tax rates and calculation logic:
- VAT: 18% standard rate
- PAYE: Progressive rates (0%, 10%, 20%, 30%, 40%)
- Withholding Tax: 15% resident, 3% public institutions, 5% imports
- Consumption Tax: Various rates
- Corporate Income Tax: 30%
- Pension: 6% employee, 3% employer
"""

import uuid
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.models.tax import TaxCalculation, TaxConfig, TaxPayment
from app.modules.finance.schemas.tax import (
    TaxCalculationCreate,
    TaxCalculationRead,
    TaxConfigCreate,
    TaxConfigRead,
    TaxConfigUpdate,
    TaxPaymentCreate,
    TaxPaymentRead,
)

# ── Rwanda Tax Brackets (PAYE) ─────────────────────────────────────────────────

RWANDA_PAYE_BRACKETS = [
    (30000, Decimal("0.00")),      # First RWF 30,000 - exempt
    (100000, Decimal("0.10")),     # RWF 30,001 - 100,000 at 10%
    (200000, Decimal("0.20")),     # RWF 100,001 - 200,000 at 20%
    (300000, Decimal("0.30")),     # RWF 200,001 - 300,000 at 30%
    (None, Decimal("0.40")),       # Above RWF 300,000 at 40%
]

# Standard tax rates
TAX_RATES = {
    "vat": Decimal("18.00"),
    "withholding_resident": Decimal("15.00"),
    "withholding_public_institution": Decimal("3.00"),
    "withholding_imports": Decimal("5.00"),
    "corporate_income_tax": Decimal("30.00"),
    "pension_employee": Decimal("6.00"),
    "pension_employer": Decimal("3.00"),
}


def calculate_paye(gross_salary: Decimal) -> dict:
    """Calculate PAYE (Pay As You Earn) based on Rwanda progressive tax rates
    
    Args:
        gross_salary: Monthly gross salary in RWF
        
    Returns:
        Dictionary with tax details including breakdown by bracket
    """
    gross_salary = Decimal(str(gross_salary))
    total_tax = Decimal("0.00")
    breakdown = []
    remaining = gross_salary
    
    for bracket_limit, rate in RWANDA_PAYE_BRACKETS:
        if remaining <= 0:
            break
            
        if bracket_limit is None:
            # No limit - apply rate to all remaining
            taxable = remaining
        else:
            taxable = min(remaining, Decimal(str(bracket_limit)))
        
        tax = (taxable * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_tax += tax
        
        if taxable > 0:
            breakdown.append({
                "bracket": f"Up to RWF {bracket_limit:,}" if bracket_limit else "Above RWF 300,000",
                "rate": float(rate * 100),
                "taxable_amount": float(taxable),
                "tax_amount": float(tax),
            })
        
        remaining -= taxable
    
    return {
        "gross_salary": float(gross_salary),
        "total_paye": float(total_tax),
        "net_salary": float(gross_salary - total_tax),
        "effective_rate": float((total_tax / gross_salary * 100).quantize(Decimal("0.01"))) if gross_salary > 0 else 0,
        "breakdown": breakdown,
    }


def calculate_vat(amount: Decimal, inclusive: bool = True) -> dict:
    """Calculate VAT (Value Added Tax) at 18%
    
    Args:
        amount: Amount in RWF
        inclusive: If True, amount includes VAT; if False, amount is exclusive
        
    Returns:
        Dictionary with VAT details
    """
    amount = Decimal(str(amount))
    vat_rate = TAX_RATES["vat"] / 100
    
    if inclusive:
        # VAT inclusive: extract VAT from amount
        net_amount = (amount / (1 + vat_rate)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        vat_amount = amount - net_amount
    else:
        # VAT exclusive: add VAT to amount
        net_amount = amount
        vat_amount = (amount * vat_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    return {
        "net_amount": float(net_amount),
        "vat_rate": 18.0,
        "vat_amount": float(vat_amount),
        "gross_amount": float(net_amount + vat_amount),
        "is_inclusive": inclusive,
    }


def calculate_withholding_tax(amount: Decimal, payment_type: str = "resident") -> dict:
    """Calculate Withholding Tax
    
    Args:
        amount: Payment amount in RWF
        payment_type: resident | public_institution | imports
        
    Returns:
        Dictionary with withholding tax details
    """
    amount = Decimal(str(amount))
    
    rate_key = {
        "resident": "withholding_resident",
        "public_institution": "withholding_public_institution",
        "imports": "withholding_imports",
    }.get(payment_type, "withholding_resident")
    
    rate = TAX_RATES[rate_key] / 100
    tax_amount = (amount * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    return {
        "gross_amount": float(amount),
        "payment_type": payment_type,
        "withholding_rate": float(rate * 100),
        "withholding_amount": float(tax_amount),
        "net_payment": float(amount - tax_amount),
    }


def calculate_pension(gross_salary: Decimal) -> dict:
    """Calculate pension contributions (6% employee, 3% employer)
    
    Args:
        gross_salary: Monthly gross salary in RWF
        
    Returns:
        Dictionary with pension details
    """
    gross_salary = Decimal(str(gross_salary))
    
    employee_contribution = (gross_salary * TAX_RATES["pension_employee"] / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    employer_contribution = (gross_salary * TAX_RATES["pension_employer"] / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    return {
        "gross_salary": float(gross_salary),
        "employee_rate": 6.0,
        "employer_rate": 3.0,
        "employee_contribution": float(employee_contribution),
        "employer_contribution": float(employer_contribution),
        "total_contribution": float(employee_contribution + employer_contribution),
    }


def calculate_corporate_tax(taxable_income: Decimal) -> dict:
    """Calculate Corporate Income Tax at 30%
    
    Args:
        taxable_income: Net taxable income in RWF
        
    Returns:
        Dictionary with corporate tax details
    """
    taxable_income = Decimal(str(taxable_income))
    rate = TAX_RATES["corporate_income_tax"] / 100
    tax_amount = (taxable_income * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    return {
        "taxable_income": float(taxable_income),
        "tax_rate": 30.0,
        "tax_amount": float(tax_amount),
        "net_income": float(taxable_income - tax_amount),
    }


def calculate_consumption_tax(amount: Decimal, is_import: bool = False) -> dict:
    """Calculate Consumption Tax
    
    Args:
        amount: CIF value (imports) or selling price (local)
        is_import: True if imported goods
        
    Returns:
        Dictionary with consumption tax details
    """
    amount = Decimal(str(amount))
    # Consumption tax rates vary by product category
    # Using a standard 15% for general goods
    rate = Decimal("0.15")
    tax_amount = (amount * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    return {
        "base_amount": float(amount),
        "is_import": is_import,
        "tax_rate": 15.0,
        "tax_amount": float(tax_amount),
        "total_with_tax": float(amount + tax_amount),
    }


# ── Database Operations ────────────────────────────────────────────────────────

async def get_tax_config(db: AsyncSession, tenant_id: uuid.UUID, tax_type: str) -> TaxConfig | None:
    """Get active tax configuration for a specific tax type"""
    result = await db.execute(
        select(TaxConfig).where(
            TaxConfig.tenant_id == tenant_id,
            TaxConfig.tax_type == tax_type,
            TaxConfig.is_active == True,
        )
    )
    return result.scalar_one_or_none()


async def list_tax_configs(db: AsyncSession, tenant_id: uuid.UUID) -> list[TaxConfigRead]:
    """List all tax configurations for a tenant"""
    result = await db.execute(
        select(TaxConfig).where(TaxConfig.tenant_id == tenant_id).order_by(TaxConfig.tax_type)
    )
    configs = result.scalars().all()
    return [TaxConfigRead.model_validate(c) for c in configs]


async def create_tax_config(db: AsyncSession, tenant_id: uuid.UUID, data: TaxConfigCreate) -> TaxConfigRead:
    """Create a new tax configuration"""
    config = TaxConfig(tenant_id=tenant_id, **data.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return TaxConfigRead.model_validate(config)


async def update_tax_config(db: AsyncSession, tenant_id: uuid.UUID, config_id: uuid.UUID, data: TaxConfigUpdate) -> TaxConfigRead:
    """Update an existing tax configuration"""
    result = await db.execute(
        select(TaxConfig).where(TaxConfig.id == config_id, TaxConfig.tenant_id == tenant_id)
    )
    config = result.scalar_one()
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(config, field, value)
    
    await db.commit()
    await db.refresh(config)
    return TaxConfigRead.model_validate(config)


async def create_tax_calculation(db: AsyncSession, tenant_id: uuid.UUID, data: TaxCalculationCreate) -> TaxCalculationRead:
    """Create a tax calculation record"""
    calculation = TaxCalculation(tenant_id=tenant_id, **data.model_dump())
    db.add(calculation)
    await db.commit()
    await db.refresh(calculation)
    return TaxCalculationRead.model_validate(calculation)


async def list_tax_calculations(
    db: AsyncSession, 
    tenant_id: uuid.UUID, 
    tax_type: str | None = None,
    period: str | None = None,
    status: str | None = None,
) -> list[TaxCalculationRead]:
    """List tax calculations with optional filters"""
    query = select(TaxCalculation).where(TaxCalculation.tenant_id == tenant_id)
    
    if tax_type:
        query = query.where(TaxCalculation.calculation_type == tax_type)
    if period:
        query = query.where(TaxCalculation.period == period)
    if status:
        query = query.where(TaxCalculation.status == status)
    
    result = await db.execute(query.order_by(TaxCalculation.period.desc()))
    calculations = result.scalars().all()
    return [TaxCalculationRead.model_validate(c) for c in calculations]


async def get_tax_summary(db: AsyncSession, tenant_id: uuid.UUID, period: str) -> dict:
    """Get tax summary for a specific period"""
    result = await db.execute(
        select(
            TaxCalculation.calculation_type,
            func.sum(TaxCalculation.taxable_amount).label("total_taxable"),
            func.sum(TaxCalculation.tax_amount).label("total_tax"),
            func.count(TaxCalculation.id).label("count"),
        )
        .where(
            TaxCalculation.tenant_id == tenant_id,
            TaxCalculation.period == period,
        )
        .group_by(TaxCalculation.calculation_type)
    )
    
    summary = {}
    for row in result:
        summary[row.calculation_type] = {
            "total_taxable": float(row.total_taxable or 0),
            "total_tax": float(row.total_tax or 0),
            "count": row.count,
        }
    
    return {
        "period": period,
        "taxes": summary,
        "total_tax": sum(v["total_tax"] for v in summary.values()),
    }


async def create_tax_payment(db: AsyncSession, tenant_id: uuid.UUID, data: TaxPaymentCreate) -> TaxPaymentRead:
    """Create a tax payment record"""
    # Generate unique payment reference
    result = await db.execute(
        select(func.count(TaxPayment.id)).where(TaxPayment.tenant_id == tenant_id)
    )
    count = result.scalar() or 0
    payment_reference = f"TAX-{count + 1:04d}"
    
    payment = TaxPayment(
        tenant_id=tenant_id,
        payment_reference=payment_reference,
        **data.model_dump()
    )
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return TaxPaymentRead.model_validate(payment)


async def list_tax_payments(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    tax_type: str | None = None,
    period: str | None = None,
) -> list[TaxPaymentRead]:
    """List tax payments with optional filters"""
    query = select(TaxPayment).where(TaxPayment.tenant_id == tenant_id)
    
    if tax_type:
        query = query.where(TaxPayment.tax_type == tax_type)
    if period:
        query = query.where(TaxPayment.period == period)
    
    result = await db.execute(query.order_by(TaxPayment.payment_date.desc()))
    payments = result.scalars().all()
    return [TaxPaymentRead.model_validate(p) for p in payments]
