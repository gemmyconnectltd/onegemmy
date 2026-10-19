import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Header, Query, Response

from app.core.deps import CurrentUser, DbSession
from app.core.response import success_response
from app.modules.reporting.service.daily import daily_export_report, daily_report, export_report

router = APIRouter(tags=["Daily branch reports"])


@router.get("/reports/daily-branches")
async def daily(db: DbSession, current_user: CurrentUser, from_date: date | None = None,
                to_date: date | None = None, branch_id: uuid.UUID | None = None,
                page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                active: Annotated[uuid.UUID | None, Header(alias="X-Branch-Id")] = None):
    return success_response(data=await daily_report(db, current_user, from_date, to_date, branch_id or active, page, page_size))


@router.get("/reports/daily-branches/export")
async def export(db: DbSession, current_user: CurrentUser, from_date: date | None = None,
                 to_date: date | None = None, branch_id: uuid.UUID | None = None,
                 format: str = Query("csv", pattern="^(csv|pdf)$"),
                 active: Annotated[uuid.UUID | None, Header(alias="X-Branch-Id")] = None):
    report = await daily_export_report(db, current_user, from_date, to_date, branch_id or active)
    return Response(export_report(report, format), media_type="text/csv" if format == "csv" else "application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="daily-branches.{format}"'})
