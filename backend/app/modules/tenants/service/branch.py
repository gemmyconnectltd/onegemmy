import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.tenants.models import Branch
from app.modules.tenants.repository import BranchRepository
from app.modules.tenants.schemas import BranchCreate, BranchRead, BranchUpdate


async def get_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> BranchRead:
    branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    return BranchRead.model_validate(branch)


async def list_branches(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[BranchRead]:
    branches = await BranchRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [BranchRead.model_validate(b) for b in branches]


async def count_branches(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await BranchRepository(db).count_for_tenant(tenant_id)


async def create_branch(db: AsyncSession, tenant_id: uuid.UUID, data: BranchCreate) -> BranchRead:
    from app.modules.tenants import service

    await service.enforce_limit(db, tenant_id, "max_branches", await count_branches(db, tenant_id), noun="branch")
    branch = Branch(tenant_id=tenant_id, **data.model_dump())
    branch = await BranchRepository(db).save(branch)
    await db.commit()
    return BranchRead.model_validate(branch)


async def update_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID, data: BranchUpdate) -> BranchRead:
    branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(branch, field, value)
    branch = await BranchRepository(db).save(branch)
    await db.commit()
    return BranchRead.model_validate(branch)


async def delete_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> None:
    branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    await BranchRepository(db).delete(branch)
    await db.commit()
