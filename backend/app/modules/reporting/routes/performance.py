import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header

from app.core.deps import CurrentUser, DbSession, require_feature
from app.core.response import success_response
from app.modules.reporting.service.performance import performance

router = APIRouter(tags=["Business performance"], dependencies=[Depends(require_feature("sales"))])


@router.get("/reports/performance")
async def business_performance(db: DbSession, current_user: CurrentUser, from_date: date | None = None, to_date: date | None = None,
                               branch_id: uuid.UUID | None = None, compare: Literal["none", "previous", "year", "custom"] = "none",
                               compare_from: date | None = None, compare_to: date | None = None,
                               active: Annotated[uuid.UUID | None, Header(alias="X-Branch-Id")] = None):
    """KPIs, trend, breakdowns and insights for any period, optionally compared with another period."""
    data = await performance(db, current_user, from_date, to_date, branch_id or active, compare, compare_from, compare_to)
    return success_response(data=data, message="Business performance retrieved")


@router.get("/reports/sales-breakdown")
async def sales_breakdown_report(db: DbSession, current_user: CurrentUser, dimension: str = "product", from_date: date | None = None, to_date: date | None = None,
                                 branch_id: uuid.UUID | None = None, active: Annotated[uuid.UUID | None, Header(alias="X-Branch-Id")] = None):
    from app.modules.reporting.service.breakdowns import sales_breakdown
    return success_response(data=await sales_breakdown(db, current_user, from_date, to_date, branch_id or active, dimension), message="Sales breakdown retrieved")


@router.get("/reports/operations")
async def operations_report(db: DbSession, current_user: CurrentUser, from_date: date | None = None, to_date: date | None = None,
                            branch_id: uuid.UUID | None = None, active: Annotated[uuid.UUID | None, Header(alias="X-Branch-Id")] = None):
    from app.modules.reporting.service.breakdowns import operations
    return success_response(data=await operations(db, current_user, from_date, to_date, branch_id or active), message="Operations report retrieved")


@router.get("/reports/financial")
async def financial_report(db: DbSession, current_user: CurrentUser, from_date: date | None = None, to_date: date | None = None,
                           branch_id: uuid.UUID | None = None, active: Annotated[uuid.UUID | None, Header(alias="X-Branch-Id")] = None):
    from app.modules.reporting.service.breakdowns import financial
    return success_response(data=await financial(db, current_user, from_date, to_date, branch_id or active), message="Financial report retrieved")
