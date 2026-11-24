import uuid

from fastapi import APIRouter, Query

from app.core.branches import visible_branches
from app.core.deps import ActiveBranchId, CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.core.pagination import PageQuery
from app.core.period import PeriodQuery
from app.core.response import paginated_response, success_response
from app.modules.sales import service
from app.modules.sales.schemas import ReturnCreate, ReturnUpdate

router = APIRouter(tags=["Sales - Returns"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant.")


@router.get("/sales/returns")
async def list_returns(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: PeriodQuery, active: ActiveBranchId,
                       status: str | None = Query(None)):
    """Returns of sales made in the workspace branch (or the person's own branches), like Sales History."""
    _require_tenant(current_user.tenant_id)
    branches = visible_branches(current_user, active)
    items = await service.list_returns(db, current_user.tenant_id, status, page_params.offset, page_params.limit, period, branches)
    total = await service.count_returns(db, current_user.tenant_id, status, period, branches)
    return paginated_response(items=[i.model_dump() for i in items], total=total, page=page_params.page, page_size=page_params.page_size, message="Returns retrieved successfully")


@router.post("/sales/returns")
async def create_return(data: ReturnCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.create_return(db, current_user.tenant_id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Return created successfully", status_code=201)


@router.get("/sales/returns/{id}")
async def get_return(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_return(db, current_user.tenant_id, id)
    mine = visible_branches(current_user, None)  # staff limited to some branches open only returns of sales made there
    if mine is not None:
        from sqlalchemy import select

        from app.core.exceptions import NotFoundError
        from app.modules.sales.models.order import Order
        branch = (await db.execute(select(Order.branch_id).where(Order.id == obj.order_id))).scalar_one_or_none() if obj.order_id else None
        if branch not in mine:
            raise NotFoundError("Return not found")
    return success_response(data=obj.model_dump(), message="Return retrieved successfully")


@router.patch("/sales/returns/{id}")
async def update_return(id: uuid.UUID, data: ReturnUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.update_return(db, current_user.tenant_id, id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Return updated successfully")


@router.delete("/sales/returns/{id}")
async def delete_return(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_return(db, current_user.tenant_id, id)
    return success_response(message="Return deleted successfully")
