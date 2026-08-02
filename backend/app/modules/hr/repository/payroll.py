import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.hr.models.payroll import PayrollEntry


class PayrollRepository(BaseRepository[PayrollEntry]):
    model = PayrollEntry

    def _opts(self):
        return [selectinload(PayrollEntry.employee)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> PayrollEntry | None:
        result = await self.db.execute(
            select(PayrollEntry).options(*self._opts()).where(PayrollEntry.id == id, PayrollEntry.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, period: str | None = None, status: str | None = None, offset: int = 0, limit: int = 50) -> list[PayrollEntry]:
        stmt = select(PayrollEntry).options(*self._opts()).where(PayrollEntry.tenant_id == tenant_id)
        if period:
            stmt = stmt.where(PayrollEntry.period == period)
        if status:
            stmt = stmt.where(PayrollEntry.status == status)
        stmt = stmt.order_by(PayrollEntry.period.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, period: str | None = None, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(PayrollEntry).where(PayrollEntry.tenant_id == tenant_id)
        if period:
            stmt = stmt.where(PayrollEntry.period == period)
        if status:
            stmt = stmt.where(PayrollEntry.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def get_by_employee_period(self, tenant_id: uuid.UUID, employee_id: uuid.UUID, period: str) -> PayrollEntry | None:
        result = await self.db.execute(
            select(PayrollEntry)
            .where(PayrollEntry.tenant_id == tenant_id, PayrollEntry.employee_id == employee_id, PayrollEntry.period == period)
        )
        return result.scalar_one_or_none()
