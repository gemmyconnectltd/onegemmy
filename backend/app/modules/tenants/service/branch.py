import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.tenants.models import Branch
from app.modules.tenants.repository import BranchRepository
from app.modules.tenants.schemas import BranchCreate, BranchRead, BranchUpdate


def _to_read(branch: Branch) -> BranchRead:
    d = BranchRead.model_validate(branch)
    d.user_count = len(branch.users) if branch.users else 0
    return d


async def get_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> BranchRead:
    branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    return _to_read(branch)


async def list_branches(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[BranchRead]:
    branches = await BranchRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [_to_read(b) for b in branches]


async def count_branches(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await BranchRepository(db).count_for_tenant(tenant_id)


async def create_branch(db: AsyncSession, tenant_id: uuid.UUID, data: BranchCreate) -> BranchRead:
    from app.modules.tenants import service

    existing = await count_branches(db, tenant_id)
    await service.enforce_limit(db, tenant_id, "max_branches", existing, noun="branch")
    # A tenant's very first branch is automatically its main branch — there's
    # no meaningful "not main" state when it's the only one.
    branch = Branch(tenant_id=tenant_id, is_main=existing == 0, **data.model_dump())
    branch = await BranchRepository(db).save(branch)
    await db.commit()
    return _to_read(branch)


async def update_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID, data: BranchUpdate) -> BranchRead:
    branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(branch, field, value)
    branch = await BranchRepository(db).save(branch)
    await db.commit()
    return _to_read(branch)


async def delete_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> None:
    branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    if branch.is_main:
        raise ValidationError("Cannot delete the main branch. Set another branch as main first.")
    await BranchRepository(db).delete(branch)
    await db.commit()


async def set_main_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> BranchRead:
    repo = BranchRepository(db)
    branch = await repo.get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    await repo.clear_main_for_tenant(tenant_id, except_branch_id=branch_id)
    branch.is_main = True
    branch = await repo.save(branch)
    await db.commit()
    return _to_read(branch)


async def seed_default_branch(db: AsyncSession, tenant_id: uuid.UUID, tenant_name: str) -> None:
    branch = Branch(tenant_id=tenant_id, name="Main Branch", status="active", is_main=True)
    await BranchRepository(db).save(branch)
