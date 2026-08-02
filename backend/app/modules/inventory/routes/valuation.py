from urllib.parse import quote

from fastapi import APIRouter, Query, Response

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.response import success_response
from app.modules.inventory import service

router = APIRouter(tags=["Inventory - Reports"])


@router.get("/inventory/reports/valuation")
async def inventory_valuation(db: DbSession, current_user: CurrentUser):
    if current_user.tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")
    report = await service.inventory_valuation(db, current_user.tenant_id)
    return success_response(data=report.model_dump(), message="Inventory valuation report generated successfully")


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
