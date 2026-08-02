import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.hr.models.employee import Employee


class EmployeeRepository(BaseRepository[Employee]):
    model = Employee

    def _opts(self):
        return [selectinload(Employee.department)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Employee | None:
        result = await self.db.execute(
            select(Employee).options(*self._opts()).where(Employee.id == id, Employee.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[Employee]:
        stmt = select(Employee).options(*self._opts()).where(Employee.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Employee.employment_status == status)
        stmt = stmt.order_by(Employee.first_name, Employee.last_name).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(Employee).where(Employee.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(Employee.employment_status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.count()).select_from(Employee).where(Employee.tenant_id == tenant_id)
        )
        count = result.scalar_one()
        return f"EMP-{str(count + 1).zfill(4)}"
