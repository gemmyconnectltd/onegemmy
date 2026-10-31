import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.exceptions import ForbiddenError, ValidationError
from app.core.pagination import PageQuery
from app.core.period import PeriodQuery
from app.core.response import paginated_response, success_response
from app.modules.inventory import service
from app.modules.inventory.schemas import StockTransferCreate, StockTransferUpdate

router = APIRouter(tags=["Inventory - Stock Transfers"])


def _require_tenant(tenant_id) -> None:
    if tenant_id is None:
        raise ValidationError("This account has no tenant. Log in as a tenant user.")


def _my_branches(user) -> list[uuid.UUID] | None:
    """The branches a restricted person may see transfers for; None means every branch."""
    from app.core.branches import has_branch_restriction
    if not has_branch_restriction(user):
        return None
    ids = user.branch_ids if user.branch_ids is not None else [user.branch_id]
    return [uuid.UUID(str(i)) for i in ids if i]


@router.get("/inventory/transfers/destinations")
async def transfer_destinations(db: DbSession, current_user: CurrentUser):
    """Every active branch of the business, by name only: a branch-restricted person may send stock TO any branch."""
    _require_tenant(current_user.tenant_id)
    from sqlalchemy import select

    from app.modules.tenants.models import Branch
    rows = (await db.execute(select(Branch.id, Branch.name).where(Branch.tenant_id == current_user.tenant_id, Branch.status == "active").order_by(Branch.name))).all()
    return success_response(data=[{"id": str(i), "name": n} for i, n in rows], message="Destinations retrieved successfully")


@router.get("/inventory/transfers")
async def list_transfers(db: DbSession, current_user: CurrentUser, page_params: PageQuery, period: PeriodQuery,
                         status: str | None = None):
    _require_tenant(current_user.tenant_id)
    mine = _my_branches(current_user)
    items = await service.list_transfers(db, current_user.tenant_id, status,
                                         page_params.offset, page_params.limit, period, mine)
    total = await service.count_transfers(db, current_user.tenant_id, status, period, mine)
    return paginated_response(items=[i.model_dump() for i in items], total=total,
                              page=page_params.page, page_size=page_params.page_size,
                              message="Transfers retrieved successfully")


@router.post("/inventory/transfers")
async def create_transfer(data: StockTransferCreate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    from app.core.branches import has_branch_restriction
    if has_branch_restriction(current_user):
        mine = {str(b) for b in (current_user.branch_ids if current_user.branch_ids is not None else [current_user.branch_id]) if b}
        if str(data.from_branch_id) not in mine:
            raise ForbiddenError("You can only send stock out of your own branch. Any branch can be the destination.")
    obj = await service.create_transfer(db, current_user.tenant_id, current_user.id, data)
    # A person without approval authority gets a request opened for the transfer; it can't be started until it is approved.
    from app.modules.approvals import service as approvals
    from app.modules.inventory.models.transfer import StockTransfer
    transfer = await db.get(StockTransfer, obj.id)
    request = await approvals.open_transfer_request(db, current_user, transfer) if transfer is not None else None
    body = obj.model_dump()
    body["approval_request_id"] = str(request.id) if request else None
    return success_response(data=body, message="Transfer created successfully" + (" and sent for approval" if request else ""), status_code=201)


@router.get("/inventory/transfers/{id}")
async def get_transfer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    obj = await service.get_transfer(db, current_user.tenant_id, id)
    mine = _my_branches(current_user)
    if mine is not None and not ({obj.from_branch_id, obj.to_branch_id} & set(mine)):
        raise ForbiddenError("This transfer does not involve your branches")
    return success_response(data=obj.model_dump(), message="Transfer retrieved successfully")


@router.patch("/inventory/transfers/{id}")
async def update_transfer(id: uuid.UUID, data: StockTransferUpdate, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    if data.status in ("in_transit", "completed"):
        from app.modules.approvals.service import require_transfer_approval
        await require_transfer_approval(db, current_user, id)
    obj = await service.update_transfer(db, current_user.tenant_id, id, current_user.id, data)
    return success_response(data=obj.model_dump(), message="Transfer updated successfully")


@router.delete("/inventory/transfers/{id}")
async def delete_transfer(id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    _require_tenant(current_user.tenant_id)
    await service.delete_transfer(db, current_user.tenant_id, id)
    return success_response(message="Transfer deleted successfully")
