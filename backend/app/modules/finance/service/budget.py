import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.finance.models.budget import Budget
from app.modules.finance.repository import BudgetRepository
from app.modules.finance.schemas import BudgetCreate, BudgetRead, BudgetUpdate


async def list_budgets(db: AsyncSession, tenant_id: uuid.UUID, period: str | None = None, offset: int = 0, limit: int = 100) -> list[BudgetRead]:
    items = await BudgetRepository(db).list_for_tenant(tenant_id, period, offset, limit)
    return [BudgetRead.model_validate(i) for i in items]


async def count_budgets(db: AsyncSession, tenant_id: uuid.UUID, period: str | None = None) -> int:
    return await BudgetRepository(db).count_for_tenant(tenant_id, period)


async def get_budget(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> BudgetRead:
    obj = await BudgetRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Budget not found")
    return BudgetRead.model_validate(obj)


async def create_budget(db: AsyncSession, tenant_id: uuid.UUID, data: BudgetCreate) -> BudgetRead:
    repo = BudgetRepository(db)
    existing = await repo.get_by_account_period(tenant_id, data.account_id, data.period)
    if existing:
        raise ConflictError(f"Budget for this account and period {data.period} already exists")
    obj = Budget(tenant_id=tenant_id, **data.model_dump())
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return BudgetRead.model_validate(obj)


async def update_budget(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: BudgetUpdate) -> BudgetRead:
    repo = BudgetRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Budget not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return BudgetRead.model_validate(obj)


async def delete_budget(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await BudgetRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Budget not found")
    await BudgetRepository(db).delete(obj)
    await db.commit()
