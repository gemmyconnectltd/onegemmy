from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
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


@router.get("/unsubscribe", response_class=HTMLResponse, dependencies=[Depends(rate_limit("unsubscribe", limit=30, window_seconds=3600))])
async def unsubscribe(token: str, db: DbSession):
    """Target of the unsubscribe link in outgoing marketing email. The signed token IS the authorisation — no login."""
    from app.modules.support import outreach

    tenant_id = outreach.tenant_from_token(token)
    ok = tenant_id is not None and await outreach.opt_out(db, tenant_id)
    title, text = ("You're unsubscribed", "We won't send you marketing messages any more. You'll still get account and support emails.") if ok else (
        "This link isn't valid", "The unsubscribe link is invalid or has expired. Reply to the email and we'll remove you.")
    return HTMLResponse(f"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{title}</title>"
                        f"<body style='font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#10182d'>"
                        f"<h1 style='font-size:22px'>{title}</h1><p style='color:#5b6478'>{text}</p></body>", status_code=200 if ok else 400)
