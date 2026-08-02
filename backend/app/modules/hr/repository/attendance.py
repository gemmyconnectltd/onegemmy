import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.hr.models.attendance import Attendance


class AttendanceRepository(BaseRepository[Attendance]):
    model = Attendance

    def _opts(self):
        return [selectinload(Attendance.employee)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Attendance | None:
        result = await self.db.execute(
            select(Attendance).options(*self._opts()).where(Attendance.id == id, Attendance.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, employee_id: uuid.UUID | None = None, status: str | None = None, offset: int = 0, limit: int = 50) -> list[Attendance]:
        stmt = select(Attendance).options(*self._opts()).where(Attendance.tenant_id == tenant_id)
        if employee_id:
            stmt = stmt.where(Attendance.employee_id == employee_id)
        if status:
            stmt = stmt.where(Attendance.status == status)
        stmt = stmt.order_by(Attendance.date.desc(), Attendance.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, employee_id: uuid.UUID | None = None, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(Attendance).where(Attendance.tenant_id == tenant_id)
        if employee_id:
            stmt = stmt.where(Attendance.employee_id == employee_id)
        if status:
            stmt = stmt.where(Attendance.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()
