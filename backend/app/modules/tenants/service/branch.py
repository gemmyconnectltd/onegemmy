import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
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


async def list_branches(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20, ids: list[uuid.UUID] | None = None) -> list[BranchRead]:
    branches = await BranchRepository(db).list_for_tenant(tenant_id, offset, limit, ids)
    return [_to_read(b) for b in branches]


async def count_branches(db: AsyncSession, tenant_id: uuid.UUID, ids: list[uuid.UUID] | None = None) -> int:
    return await BranchRepository(db).count_for_tenant(tenant_id, ids)


async def create_branch(db: AsyncSession, tenant_id: uuid.UUID, data: BranchCreate) -> BranchRead:
    from app.modules.tenants import service

    existing = await count_branches(db, tenant_id)
    await service.enforce_limit(db, tenant_id, "max_branches", existing, noun="branch")
    # A tenant's very first branch is automatically its main branch — there's
    # no meaningful "not main" state when it's the only one.
    branch = Branch(tenant_id=tenant_id, is_main=existing == 0, **data.model_dump())
    branch = await BranchRepository(db).save(branch)
    from app.modules.billing.worker import sync_usage
    await sync_usage(db, tenant_id)
    await db.commit()
    return _to_read(branch)


async def update_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID, data: BranchUpdate) -> BranchRead:
    from app.modules.billing.repository import BillingRepository
    await BillingRepository(db).tenant(tenant_id, lock=True)
    branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    if data.status and data.status != "active" and branch.status == "active":
        if branch.is_main:
            raise ValidationError("The main branch can't be deactivated. Make another branch the main one first.")
        others = (await db.execute(select(func.count()).select_from(Branch).where(
            Branch.tenant_id == tenant_id, Branch.id != branch_id, Branch.status == "active"))).scalar_one()
        if others == 0:
            raise ValidationError("This is your only active branch, so it can't be deactivated.")
    if data.status == "active" and branch.status != "active":
        from app.modules.tenants import service
        await service.enforce_limit(db, tenant_id, "max_branches", await count_branches(db, tenant_id), noun="branch")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(branch, field, value)
    branch = await BranchRepository(db).save(branch)
    from app.modules.billing.worker import sync_usage
    await sync_usage(db, tenant_id)
    await db.commit()
    return _to_read(branch)


async def delete_branch(db: AsyncSession, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> None:
    from app.modules.billing.repository import BillingRepository
    await BillingRepository(db).tenant(tenant_id, lock=True)
    branch = await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id)
    if branch is None:
        raise NotFoundError("Branch not found")
    if branch.is_main:
        raise ValidationError("Cannot delete the main branch. Set another branch as main first.")
    try:
        await BranchRepository(db).delete(branch)
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ConflictError("This branch has records attached to it (sales, expenses, transfers ...), so it can't be deleted. Deactivate it instead.") from None
    from app.modules.billing.worker import sync_usage
    await sync_usage(db, tenant_id)
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
