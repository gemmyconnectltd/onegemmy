import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.accounting.models.budget import Budget


class BudgetRepository(BaseRepository[Budget]):
    model = Budget

    def _opts(self):
        return [selectinload(Budget.account)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Budget | None:
        result = await self.db.execute(
            select(Budget).options(*self._opts())
            .where(Budget.id == id, Budget.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_account_period(self, tenant_id: uuid.UUID, account_id: uuid.UUID, period: str) -> Budget | None:
        result = await self.db.execute(
            select(Budget).where(
                Budget.tenant_id == tenant_id,
                Budget.account_id == account_id,
                Budget.period == period,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, period: str | None = None, offset: int = 0, limit: int = 100) -> list[Budget]:
        stmt = select(Budget).options(*self._opts()).where(Budget.tenant_id == tenant_id)
        if period:
            stmt = stmt.where(Budget.period == period)
        stmt = stmt.order_by(Budget.period.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, period: str | None = None) -> int:
        stmt = select(func.count()).select_from(Budget).where(Budget.tenant_id == tenant_id)
        if period:
            stmt = stmt.where(Budget.period == period)
        result = await self.db.execute(stmt)
        return result.scalar_one()
