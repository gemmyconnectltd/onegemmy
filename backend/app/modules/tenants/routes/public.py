from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select

from app.core.deps import DbSession
from app.core.email import send_contact_email
from app.core.exceptions import AppError
from app.core.rate_limit import rate_limit
from app.core.response import success_response
from app.modules.inventory.models.product import Product
from app.modules.sales.models.order import Order
from app.modules.tenants.models import Tenant
from app.modules.tenants.routes.currency import SUPPORTED_CURRENCIES

router = APIRouter(tags=["Public"])

# Tenant-facing business modules, matching api_router.py's include_router
# calls exactly. Kept as an explicit list rather than introspected at runtime
# so bumping this count is a deliberate one-line change, not silent drift.
PLATFORM_MODULES = [
    "inventory", "sales", "accounting", "hr",
    "procurement", "crm", "manufacturing", "repairs",
]


@router.get("/platform-stats")
async def public_platform_stats(db: DbSession):
    """Real, safe-to-publish numbers for the marketing site. No auth — this
    is meant to be fetched from public pages — so it must never include
    per-tenant data, revenue, or anything that could identify a business."""
    businesses = (await db.execute(
        select(func.count()).select_from(Tenant).where(Tenant.is_active == True)
    )).scalar_one()
    orders_processed = (await db.execute(
        select(func.count()).select_from(Order).where(Order.status == "Completed")
    )).scalar_one()
    products_managed = (await db.execute(
        select(func.count()).select_from(Product)
    )).scalar_one()
    countries = (await db.execute(
        select(func.count(func.distinct(Tenant.country)))
        .where(Tenant.country.isnot(None), Tenant.is_active == True)
    )).scalar_one()

    return success_response(data={
        "businesses": businesses,
        "orders_processed": orders_processed,
        "products_managed": products_managed,
        "countries": countries,
        "modules": len(PLATFORM_MODULES),
        "currencies": len(SUPPORTED_CURRENCIES),
    }, message="Platform stats retrieved")


class ContactRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    company: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    industry: str | None = Field(default=None, max_length=100)
    employee_count: str | None = Field(default=None, max_length=40)
    inquiry_type: str | None = Field(default=None, max_length=100)
    message: str = Field(min_length=1, max_length=5000)


@router.post("/contact", dependencies=[Depends(rate_limit("contact", limit=5, window_seconds=3600))])
async def submit_contact_form(data: ContactRequest):
    """Marketing-site contact form. No auth, no DB write — the message is
    relayed straight to the team inbox by email. Rate-limited per IP since
    this is a public, unauthenticated, abuse-prone endpoint."""
    sent = await send_contact_email(
        name=data.name.strip(),
        email=data.email,
        company=data.company.strip(),
        phone=data.phone.strip() if data.phone else None,
        industry=data.industry.strip() if data.industry else None,
        employee_count=data.employee_count.strip() if data.employee_count else None,
        inquiry_type=data.inquiry_type.strip() if data.inquiry_type else None,
        message=data.message.strip(),
    )
    if not sent:
        raise AppError(
            "We couldn't send your message right now — please email us directly at info@pesaa.io.",
            status_code=503,
        )
    return success_response(message="Message sent successfully")
