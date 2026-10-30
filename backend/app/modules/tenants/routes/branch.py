import uuid
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, require_feature, require_permission
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.audit.service import record_audit
from app.modules.tenants import service
from app.modules.tenants.schemas import BranchCreate, BranchUpdate
from app.modules.tenants.service import branch_insight


async def branch_access(request: Request, db: DbSession, user: CurrentUser):
    if request.method != "GET":
        action = {"POST": "create", "PATCH": "update", "DELETE": "delete"}.get(request.method, "update")
        await require_permission(f"branches:{action}")(user)
    branch_id = request.path_params.get("branch_id")
    if branch_id:
        from app.modules.accounting.service.workspace import resolve_branch
        await resolve_branch(db, user, uuid.UUID(branch_id))


router = APIRouter(tags=["Branches"], dependencies=[Depends(branch_access)])


def _allowed(user) -> list[uuid.UUID] | None:
    """Branches a person may see: their own list, or everything when they have no limit."""
    if user.branch_ids is not None:
        return [uuid.UUID(str(i)) for i in user.branch_ids]
    return [user.branch_id] if user.branch_id else None


async def _audit(db, user, branch_id, action: str, summary: str, changes: dict | None = None) -> None:
    await record_audit(db, tenant_id=user.tenant_id, actor_user_id=user.id, actor_name=user.full_name or user.email, action=action,
                       entity_type="branch", entity_id=str(branch_id), summary=summary, changes=changes)
    await db.commit()


async def _can_see_sales(db, user) -> bool:
    """Sales figures need the sales module on (or turned off but readable) and permission to read orders."""
    from app.modules.tenants.service import module_status
    if not (user.is_superuser or "orders:read" in user.permissions_names):
        return False
    return await module_status(db, user.tenant_id, "sales") in ("enabled", "available")


@router.get("/branches/overview", dependencies=[Depends(require_permission("branches:read"))])
async def branches_overview(db: DbSession, current_user: CurrentUser, page_params: PageQuery, search: str | None = Query(None, max_length=120),
                            status: Literal["active", "inactive"] | None = None, sort: Literal["name", "created", "sales", "staff"] = "name",
                            direction: Literal["asc", "desc"] = Query("asc", alias="dir"), from_date: date | None = None, to_date: date | None = None,
                            branch_id: uuid.UUID | None = None):
    """The directory: every branch the person may see with staff and sales for the chosen period, in a handful of grouped queries."""
    from app.modules.tenants.models import Tenant
    tenant = await db.get(Tenant, current_user.tenant_id)
    allowed = _allowed(current_user)
    if branch_id is not None:  # one branch's own numbers (a branch's page); still limited to what the person may see
        allowed = [branch_id] if allowed is None or branch_id in allowed else []
    data = await branch_insight.directory(db, tenant, allowed=allowed, search=search, status=status, sort=sort, direction=direction,
                                          start=from_date, end=to_date, offset=page_params.offset, limit=page_params.limit,
                                          include_sales=await _can_see_sales(db, current_user))
    return paginated_response(items=data["items"], total=data["total"], page=page_params.page, page_size=page_params.page_size,
                              message="Branch overview retrieved", summary=data["summary"])


@router.get("/branches")
async def list_branches(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    ids = ([uuid.UUID(str(id)) for id in current_user.branch_ids] if current_user.branch_ids is not None else [current_user.branch_id] if current_user.branch_id else None)
    branches = await service.list_branches(db, current_user.tenant_id, page_params.offset, page_params.limit, ids)
    total = await service.count_branches(db, current_user.tenant_id, ids)
    return paginated_response(
        items=[b.model_dump() for b in branches],
        total=total,
        page=page_params.page,
        page_size=page_params.page_size,
        message="Branches retrieved successfully",
    )


@router.post("/branches")
async def create_branch(data: BranchCreate, db: DbSession, current_user: CurrentUser):
    branch = await service.create_branch(db, current_user.tenant_id, data)
    await _audit(db, current_user, branch.id, "branch.create", f"Branch {branch.name} created", {"name": branch.name, "status": branch.status})
    return success_response(
        data=branch.model_dump(),
        message="Branch created successfully",
        status_code=201,
    )


@router.get("/branches/{branch_id}")
async def get_branch(branch_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    branch = await service.get_branch(db, current_user.tenant_id, branch_id)
    return success_response(
        data=branch.model_dump(),
        message="Branch retrieved successfully",
    )


@router.get("/branches/{branch_id}/stats")
async def get_branch_stats(branch_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    from app.modules.tenants.models.user import User

    # Verify branch belongs to tenant
    await service.get_branch(db, current_user.tenant_id, branch_id)

    # Users in this branch
    user_rows = (await db.execute(
        select(User.id, User.full_name, User.email, User.role, User.is_active)
        .where(User.tenant_id == current_user.tenant_id, User.branch_id == branch_id)
    )).all()
    users = [
        {"id": str(r.id), "full_name": r.full_name, "email": r.email, "role": r.role, "is_active": r.is_active}
        for r in user_rows
    ]

    # Transfers involving this branch
    from app.modules.inventory.models.transfer import StockTransfer
    transfer_rows = (await db.execute(
        select(StockTransfer)
        .where(
            StockTransfer.tenant_id == current_user.tenant_id,
            (StockTransfer.from_branch_id == branch_id) | (StockTransfer.to_branch_id == branch_id)
        )
        .order_by(StockTransfer.created_at.desc())
        .limit(10)
    )).scalars().all()
    transfers = [
        {
            "id": str(t.id), "transfer_number": t.transfer_number,
            "status": t.status, "created_at": t.created_at.isoformat() if t.created_at else None,
            "direction": "outgoing" if str(t.from_branch_id) == str(branch_id) else "incoming",
        }
        for t in transfer_rows
    ]

    stats: dict[str, Any] = {
        "user_count": len(users),
        "users": users,
        "transfer_count": len(transfers),
        "recent_transfers": transfers,
    }
    return success_response(data=stats, message="Branch stats retrieved")


@router.patch("/branches/{branch_id}")
async def update_branch(
    branch_id: uuid.UUID, data: BranchUpdate, db: DbSession, current_user: CurrentUser
):
    before = await service.get_branch(db, current_user.tenant_id, branch_id)
    branch = await service.update_branch(db, current_user.tenant_id, branch_id, data)
    changed = {k: {"from": getattr(before, k), "to": getattr(branch, k)} for k in data.model_dump(exclude_unset=True) if getattr(before, k) != getattr(branch, k)}
    if changed:
        status = changed.get("status")
        await _audit(db, current_user, branch_id, "branch.status" if status and len(changed) == 1 else "branch.update",
                     (f"Branch {branch.name} {'reactivated' if status['to'] == 'active' else 'deactivated'}" if status and len(changed) == 1
                      else f"Branch {branch.name} updated: {', '.join(sorted(changed))}"), changed)
    return success_response(
        data=branch.model_dump(),
        message="Branch updated successfully",
    )


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    branch = await service.get_branch(db, current_user.tenant_id, branch_id)
    await service.delete_branch(db, current_user.tenant_id, branch_id)
    await _audit(db, current_user, branch_id, "branch.delete", f"Branch {branch.name} deleted", {"name": branch.name})
    return success_response(message="Branch deleted successfully")


@router.post("/branches/{branch_id}/set-main")
async def set_main_branch(branch_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    branch = await service.set_main_branch(db, current_user.tenant_id, branch_id)
    await _audit(db, current_user, branch_id, "branch.main", f"Branch {branch.name} made the main branch")
    return success_response(
        data=branch.model_dump(),
        message="Main branch updated successfully",
    )


@router.get("/branches/{branch_id}/sales", dependencies=[Depends(require_permission("branches:read")), Depends(require_permission("orders:read")), Depends(require_feature("sales"))])
async def branch_sales(branch_id: uuid.UUID, db: DbSession, current_user: CurrentUser, from_date: date | None = None, to_date: date | None = None):
    """One branch's sales for a period against the period before it, with trend, top products, payment methods and recent orders."""
    from app.modules.tenants.models import Tenant
    await service.get_branch(db, current_user.tenant_id, branch_id)
    tenant = await db.get(Tenant, current_user.tenant_id)
    return success_response(data=await branch_insight.branch_sales(db, tenant, branch_id, from_date, to_date), message="Branch sales retrieved")


@router.get("/branches/{branch_id}/activity", dependencies=[Depends(require_permission("branches:read"))])
async def branch_activity(branch_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    """Recorded changes to this branch: created, edited, activated or deactivated, made main, deleted."""
    await service.get_branch(db, current_user.tenant_id, branch_id)
    return success_response(data=await branch_insight.branch_activity(db, current_user.tenant_id, branch_id), message="Branch activity retrieved")
