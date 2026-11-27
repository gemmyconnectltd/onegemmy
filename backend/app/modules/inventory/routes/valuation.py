from urllib.parse import quote

from fastapi import APIRouter, Query, Response

from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.response import success_response
from app.modules.inventory import service

router = APIRouter(tags=["Inventory - Reports"])


async def scoped_stock(db, user, branch_id=None) -> dict | None:
    """The stock of the chosen branch (or of the warehouses this person may see), or None for the business-wide figures."""
    from app.modules.inventory.service import branch_stock
    warehouses = await branch_stock.viewing_warehouses(db, user, branch_id)
    return None if warehouses is None else await branch_stock.stock_in(db, user.tenant_id, warehouses)


async def branch_levels(db, user, branch_id) -> dict | None:
    """The chosen branch's own reorder levels, so "low" there is judged by that branch."""
    if branch_id is None:
        return None
    from app.modules.inventory.service.branch_inventory import branch_levels as levels
    return await levels(db, user.tenant_id, branch_id)


@router.get("/inventory/reports/valuation")
async def inventory_valuation(db: DbSession, current_user: CurrentUser, pagination: PageQuery, active_branch: ActiveBranchId, status: str = Query("all", pattern="^(all|low|out|ok)$"),
                              search: str | None = Query(None, max_length=100)):
    if current_user.tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")
    report = await service.inventory_valuation(db, current_user.tenant_id, await scoped_stock(db, current_user, active_branch),
                                               await branch_levels(db, current_user, active_branch))
    needle = (search or "").strip().lower()
    lines = [line for line in report.lines if (status == "all" or line.status == status)
             and (not needle or needle in line.name.lower() or needle in (line.sku or "").lower())]
    payload = report.model_dump()
    payload.update(total=len(lines), page=pagination.page, page_size=min(pagination.limit, 100))
    offset = (pagination.page - 1) * min(pagination.limit, 100)
    payload["lines"] = [line.model_dump() for line in lines[offset:offset + min(pagination.limit, 100)]]
    return success_response(data=payload, message="Inventory valuation report generated successfully")


@router.get("/inventory/reports/valuation/export")
async def export_inventory_valuation(db: DbSession, current_user: CurrentUser, active_branch: ActiveBranchId, format: str = Query("csv", pattern="^(csv|pdf)$")):
    if current_user.tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")
    filename, content, media_type = await service.export_valuation_report(db, current_user.tenant_id, format, await scoped_stock(db, current_user, active_branch),
                                                                         await branch_levels(db, current_user, active_branch))
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
