import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.accounting.models.expense import Expense


class ExpenseRepository(BaseRepository[Expense]):
    model = Expense

    def _opts(self):
        return [selectinload(Expense.account)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Expense | None:
        result = await self.db.execute(
            select(Expense).options(*self._opts())
            .where(Expense.id == id, Expense.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[Expense]:
        stmt = select(Expense).options(*self._opts()).where(Expense.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Expense.status == status)
        stmt = stmt.order_by(Expense.expense_date.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(Expense).where(Expense.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Expense.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.count()).select_from(Expense).where(Expense.tenant_id == tenant_id)
        )
        count = result.scalar_one()
        return f"EXP-{str(count + 1).zfill(4)}"
