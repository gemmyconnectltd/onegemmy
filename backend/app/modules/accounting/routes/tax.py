from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.response import success_response
from app.modules.accounting import service
from app.modules.accounting.schemas.tax import (
    RwandaTaxRates,
    TaxCalculationCreate,
    TaxConfigCreate,
    TaxConfigUpdate,
    TaxPaymentCreate,
)
from app.modules.accounting.service.tax import (
    calculate_consumption_tax,
    calculate_corporate_tax,
    calculate_paye,
    calculate_pension,
    calculate_vat,
    calculate_withholding_tax,
)

router = APIRouter(tags=["Accounting - Tax Management"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


# ── Tax Calculator Endpoints ──────────────────────────────────────────────────

@router.get("/accounting/tax/rates")
async def get_rwanda_tax_rates():
    """Get reference Rwanda tax rates"""
    return success_response(data=RwandaTaxRates().model_dump(), message="Rwanda tax rates retrieved")


@router.post("/accounting/tax/calculate/paye")
async def calculate_paye_endpoint(data: dict):
    """Calculate PAYE for a given salary"""
    salary = data.get("salary", 0)
    result = calculate_paye(salary)
    return success_response(data=result, message="PAYE calculated successfully")


@router.post("/accounting/tax/calculate/vat")
async def calculate_vat_endpoint(data: dict):
    """Calculate VAT for a given amount"""
    amount = data.get("amount", 0)
    inclusive = data.get("inclusive", True)
    result = calculate_vat(amount, inclusive)
    return success_response(data=result, message="VAT calculated successfully")


@router.post("/accounting/tax/calculate/withholding")
async def calculate_withholding_endpoint(data: dict):
    """Calculate withholding tax"""
    amount = data.get("amount", 0)
    payment_type = data.get("payment_type", "resident")
    result = calculate_withholding_tax(amount, payment_type)
    return success_response(data=result, message="Withholding tax calculated successfully")


@router.post("/accounting/tax/calculate/pension")
async def calculate_pension_endpoint(data: dict):
    """Calculate pension contributions"""
    salary = data.get("salary", 0)
    result = calculate_pension(salary)
    return success_response(data=result, message="Pension calculated successfully")


@router.post("/accounting/tax/calculate/corporate")
async def calculate_corporate_endpoint(data: dict):
    """Calculate corporate income tax"""
    income = data.get("taxable_income", 0)
    result = calculate_corporate_tax(income)
    return success_response(data=result, message="Corporate tax calculated successfully")


@router.post("/accounting/tax/calculate/consumption")
async def calculate_consumption_endpoint(data: dict):
    """Calculate consumption tax"""
    amount = data.get("amount", 0)
    is_import = data.get("is_import", False)
    result = calculate_consumption_tax(amount, is_import)
    return success_response(data=result, message="Consumption tax calculated successfully")


# ── Tax Configuration Endpoints ───────────────────────────────────────────────

@router.get("/accounting/tax/configs")
async def list_tax_configs(db: DbSession, current_user: CurrentUser):
    """List all tax configurations"""
    _require_tenant(current_user.tenant_id)
    configs = await service.tax.list_tax_configs(db, current_user.tenant_id)
    return success_response(data=[c.model_dump() for c in configs], message="Tax configurations retrieved")


@router.post("/accounting/tax/configs")
async def create_tax_config(db: DbSession, current_user: CurrentUser, data: TaxConfigCreate):
    """Create a tax configuration"""
    _require_tenant(current_user.tenant_id)
    config = await service.tax.create_tax_config(db, current_user.tenant_id, data)
    return success_response(data=config.model_dump(), message="Tax configuration created", status_code=201)


@router.patch("/accounting/tax/configs/{config_id}")
async def update_tax_config(db: DbSession, current_user: CurrentUser, config_id: str, data: TaxConfigUpdate):
    """Update a tax configuration"""
    _require_tenant(current_user.tenant_id)
    import uuid
    config = await service.tax.update_tax_config(db, current_user.tenant_id, uuid.UUID(config_id), data)
    return success_response(data=config.model_dump(), message="Tax configuration updated")


# ── Tax Calculation Endpoints ──────────────────────────────────────────────────

@router.get("/accounting/tax/calculations")
async def list_tax_calculations(
    db: DbSession,
    current_user: CurrentUser,
    tax_type: str | None = Query(None),
    period: str | None = Query(None),
    status: str | None = Query(None),
):
    """List tax calculations"""
    _require_tenant(current_user.tenant_id)
    calculations = await service.tax.list_tax_calculations(db, current_user.tenant_id, tax_type, period, status)
    return success_response(data=[c.model_dump() for c in calculations], message="Tax calculations retrieved")


@router.post("/accounting/tax/calculations")
async def create_tax_calculation(db: DbSession, current_user: CurrentUser, data: TaxCalculationCreate):
    """Create a tax calculation record"""
    _require_tenant(current_user.tenant_id)
    calculation = await service.tax.create_tax_calculation(db, current_user.tenant_id, data)
    return success_response(data=calculation.model_dump(), message="Tax calculation created", status_code=201)


@router.get("/accounting/tax/summary/{period}")
async def get_tax_summary(db: DbSession, current_user: CurrentUser, period: str):
    """Get tax summary for a period"""
    _require_tenant(current_user.tenant_id)
    summary = await service.tax.get_tax_summary(db, current_user.tenant_id, period)
    return success_response(data=summary, message="Tax summary retrieved")


# ── Tax Payment Endpoints ──────────────────────────────────────────────────────

@router.get("/accounting/tax/payments")
async def list_tax_payments(
    db: DbSession,
    current_user: CurrentUser,
    tax_type: str | None = Query(None),
    period: str | None = Query(None),
):
    """List tax payments"""
    _require_tenant(current_user.tenant_id)
    payments = await service.tax.list_tax_payments(db, current_user.tenant_id, tax_type, period)
    return success_response(data=[p.model_dump() for p in payments], message="Tax payments retrieved")


@router.post("/accounting/tax/payments")
async def create_tax_payment(db: DbSession, current_user: CurrentUser, data: TaxPaymentCreate):
    """Record a tax payment"""
    _require_tenant(current_user.tenant_id)
    payment = await service.tax.create_tax_payment(db, current_user.tenant_id, data)
    return success_response(data=payment.model_dump(), message="Tax payment recorded", status_code=201)
