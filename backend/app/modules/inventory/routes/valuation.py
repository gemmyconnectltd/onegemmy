from urllib.parse import quote

from fastapi import APIRouter, Query, Response

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import success_response
from app.modules.inventory import service

router = APIRouter(tags=["Inventory - Reports"])


@router.get("/inventory/reports/valuation")
async def inventory_valuation(db: DbSession, current_user: CurrentUser, pagination: PageQuery, status: str = Query("all", pattern="^(all|low|out|ok)$")):
    if current_user.tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")
    report = await service.inventory_valuation(db, current_user.tenant_id)
    lines = [line for line in report.lines if status == "all" or line.status == status]
    payload = report.model_dump()
    payload.update(total=len(lines), page=pagination.page, page_size=min(pagination.limit, 100))
    offset = (pagination.page - 1) * min(pagination.limit, 100)
    payload["lines"] = [line.model_dump() for line in lines[offset:offset + min(pagination.limit, 100)]]
    return success_response(data=payload, message="Inventory valuation report generated successfully")


@router.get("/inventory/reports/valuation/export")
async def export_inventory_valuation(db: DbSession, current_user: CurrentUser, format: str = Query("csv", pattern="^(csv|pdf)$")):
    if current_user.tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")
    filename, content, media_type = await service.export_valuation_report(db, current_user.tenant_id, format)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
