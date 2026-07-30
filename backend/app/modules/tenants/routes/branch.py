import uuid

from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import PageQuery
from app.core.response import paginated_response
from app.core.response import success_response
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
