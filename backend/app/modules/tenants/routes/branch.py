import uuid
from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response, success_response
from app.modules.tenants import service
from app.modules.tenants.schemas import BranchCreate, BranchUpdate

router = APIRouter(tags=["Branches"])


@router.get("/branches")
async def list_branches(db: DbSession, current_user: CurrentUser, page_params: PageQuery):
    branches = await service.list_branches(db, current_user.tenant_id, page_params.offset, page_params.limit)
    total = await service.count_branches(db, current_user.tenant_id)
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
    from app.modules.tenants.models import Branch
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
    try:
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
    except Exception:
        transfers = []

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
    branch = await service.update_branch(db, current_user.tenant_id, branch_id, data)
    return success_response(
        data=branch.model_dump(),
        message="Branch updated successfully",
    )


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    await service.delete_branch(db, current_user.tenant_id, branch_id)
    return success_response(message="Branch deleted successfully")


@router.post("/branches/{branch_id}/set-main")
async def set_main_branch(branch_id: uuid.UUID, db: DbSession, current_user: CurrentUser):
    branch = await service.set_main_branch(db, current_user.tenant_id, branch_id)
    return success_response(
        data=branch.model_dump(),
        message="Main branch updated successfully",
    )
