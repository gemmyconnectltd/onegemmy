import uuid

from sqlalchemy import text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.finance.models.budget import Budget
from app.modules.finance.models.expense import Expense
from app.modules.finance.repository import BudgetRepository, ExpenseRepository
from app.modules.finance.schemas import ExpenseCreate, ExpenseRead, ExpenseUpdate
from app.modules.finance.service.transaction import create_expense_transaction


async def list_expenses(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[ExpenseRead]:
    items = await ExpenseRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [ExpenseRead.model_validate(i) for i in items]


async def count_expenses(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await ExpenseRepository(db).count_for_tenant(tenant_id, status)


async def get_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ExpenseRead:
    obj = await ExpenseRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    return ExpenseRead.model_validate(obj)


async def create_expense(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: ExpenseCreate) -> ExpenseRead:
    repo = ExpenseRepository(db)
    reference = await repo.next_reference(tenant_id)
    obj = Expense(
        tenant_id=tenant_id,
        reference=reference,
        created_by=user_id,
        **data.model_dump(),
    )
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return ExpenseRead.model_validate(obj)


async def update_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ExpenseUpdate) -> ExpenseRead:
    repo = ExpenseRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    if obj.status != "Pending":
        raise ValidationError("Only pending expenses can be edited")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return ExpenseRead.model_validate(obj)


async def approve_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID) -> ExpenseRead:
    # Lock the row to prevent duplicate approvals from concurrent requests
    await db.execute(text("SELECT 1 FROM finance_expenses WHERE id = :id FOR UPDATE"), {"id": id})

    repo = ExpenseRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    if obj.status != "Pending":
        raise ValidationError(f"Expense is already {obj.status}")
    obj.status = "Approved"
    obj.approved_by = user_id
    await repo.save(obj)

    # bump budget spent
    period = obj.expense_date.strftime("%Y-%m")
    if obj.account_id:
        budget = await BudgetRepository(db).get_by_account_period(tenant_id, obj.account_id, period)
        if budget:
            await db.execute(
                update(Budget)
                .where(Budget.id == budget.id)
                .values(spent=Budget.spent + obj.amount)
            )

    # auto-create journal entry
    await create_expense_transaction(
        db, tenant_id, user_id, obj.id, obj.amount, obj.reference, obj.account_id
    )

    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return ExpenseRead.model_validate(obj)


async def reject_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID) -> ExpenseRead:
    repo = ExpenseRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    if obj.status != "Pending":
        raise ValidationError(f"Expense is already {obj.status}")
    obj.status = "Rejected"
    obj.approved_by = user_id
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return ExpenseRead.model_validate(obj)


async def delete_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ExpenseRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    if obj.status == "Approved":
        raise ValidationError("Cannot delete an approved expense")
    await ExpenseRepository(db).delete(obj)
    await db.commit()
