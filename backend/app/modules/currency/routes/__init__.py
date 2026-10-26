from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.access import require_module_write
from app.core.currency import normalize_code
from app.core.deps import CurrentUser, DbSession, SuperUser
from app.core.exceptions import ForbiddenError
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.currency import service
from app.modules.currency.schemas import (
    CurrencyRead,
    ExchangeRateCreate,
    ExchangeRateRead,
    ReportingCurrencyUpdate,
)

# Tenant-facing: a business's own currency, rates and lookups. Everything is scoped to the
# caller's tenant_id — a tenant can neither read nor write another tenant's (or the platform's) rates.
tenant_router = APIRouter(prefix="/currency", tags=["Currency"])
# Super-admin only: platform reporting currency and platform-wide rates.
admin_router = APIRouter(prefix="/admin/currency", tags=["Super Admin - Currency"])


def _require_tenant(current_user: CurrentUser):
    if current_user.tenant_id is None:
        raise ForbiddenError("This action is only available inside a company")
    return current_user.tenant_id


@tenant_router.get("/settings")
async def get_tenant_currency_settings(db: DbSession, current_user: CurrentUser):
    """The business's base (accounting) currency and whether it can still be changed — it is frozen
    as soon as any transaction exists, so the UI can disable the control and say why."""
    tenant_id = _require_tenant(current_user)
    base = await service.get_base_currency(db, tenant_id)
    locked = await service.has_financial_activity(db, tenant_id)
    return success_response(
        data={
            "base_currency": base,
            "can_change": not locked,
            "locked_reason": (
                "This business has recorded transactions, so its base currency can no longer be changed — "
                "doing so would reinterpret every existing amount in a different currency."
                if locked else None
            ),
        },
        message="Currency settings retrieved",
    )


@tenant_router.get("/exchange-rates")
async def list_tenant_rates(
    db: DbSession, current_user: CurrentUser, page_params: PageQuery,
    base: str | None = None, quote: str | None = None,
):
    tenant_id = _require_tenant(current_user)
    rows, total = await service.list_rates(db, tenant_id, page_params.offset, page_params.limit, base, quote)
    return paginated_response(
        items=[ExchangeRateRead.model_validate(r).model_dump() for r in rows], total=total,
        page=page_params.page, page_size=page_params.page_size, message="Exchange rates retrieved",
    )


@tenant_router.post("/exchange-rates", status_code=201, dependencies=[Depends(require_module_write("accounting"))])
async def create_tenant_rate(data: ExchangeRateCreate, db: DbSession, current_user: CurrentUser):
    tenant_id = _require_tenant(current_user)
    row = await service.create_rate(db, tenant_id, current_user.id, data)
    await db.commit()
    return success_response(data=ExchangeRateRead.model_validate(row).model_dump(), message="Exchange rate saved", status_code=201)


@tenant_router.get("/exchange-rates/lookup")
async def lookup_tenant_rate(
    db: DbSession, current_user: CurrentUser,
    from_currency: Annotated[str, Query(alias="from", min_length=3, max_length=3)],
    to_currency: Annotated[str | None, Query(alias="to", min_length=3, max_length=3)] = None,
    at: datetime | None = None,
):
    """The rate a new document would get: `from` → `to` (default: the tenant's base currency), as of `at`."""
    tenant_id = _require_tenant(current_user)
    target = normalize_code(to_currency) if to_currency else await service.get_base_currency(db, tenant_id)
    rate, scope = await service.lookup_rate(db, tenant_id, from_currency, target, at)
    return success_response(
        data={"from": normalize_code(from_currency), "to": target, "rate": rate, "source": scope},
        message="Exchange rate resolved",
    )


@admin_router.get("/settings")
async def get_platform_currency_settings(db: DbSession, _: SuperUser):
    return success_response(
        data={"reporting_currency": await service.get_reporting_currency(db)}, message="Currency settings retrieved",
    )


@admin_router.put("/settings/reporting-currency")
async def set_platform_reporting_currency(data: ReportingCurrencyUpdate, db: DbSession, admin: SuperUser):
    """Changes how cross-tenant analytics are presented. Does not touch any tenant's base currency."""
    code = await service.set_reporting_currency(db, data.currency, admin.id)
    await db.commit()
    from app.modules.admin.analytics import invalidate_analytics_cache

    invalidate_analytics_cache()
    return success_response(data={"reporting_currency": code}, message="Reporting currency updated")


@admin_router.get("/exchange-rates")
async def list_platform_rates(
    db: DbSession, _: SuperUser, page_params: PageQuery, base: str | None = None, quote: str | None = None,
):
    rows, total = await service.list_rates(db, None, page_params.offset, page_params.limit, base, quote)
    return paginated_response(
        items=[ExchangeRateRead.model_validate(r).model_dump() for r in rows], total=total,
        page=page_params.page, page_size=page_params.page_size, message="Platform exchange rates retrieved",
    )


@admin_router.post("/exchange-rates", status_code=201)
async def create_platform_rate(data: ExchangeRateCreate, db: DbSession, admin: SuperUser):
    row = await service.create_rate(db, None, admin.id, data)
    await db.commit()
    from app.modules.admin.analytics import invalidate_analytics_cache

    invalidate_analytics_cache()
    return success_response(data=ExchangeRateRead.model_validate(row).model_dump(), message="Platform exchange rate saved", status_code=201)


__all__ = ["CurrencyRead", "admin_router", "tenant_router"]
