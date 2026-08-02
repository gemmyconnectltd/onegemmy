import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.hr.models.leave import LeaveRequest


class LeaveRepository(BaseRepository[LeaveRequest]):
    model = LeaveRequest

    def _opts(self):
        return [selectinload(LeaveRequest.employee)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> LeaveRequest | None:
        result = await self.db.execute(
            select(LeaveRequest).options(*self._opts()).where(LeaveRequest.id == id, LeaveRequest.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[LeaveRequest]:
        stmt = select(LeaveRequest).options(*self._opts()).where(LeaveRequest.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(LeaveRequest.status == status)
        stmt = stmt.order_by(LeaveRequest.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(LeaveRequest).where(LeaveRequest.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(LeaveRequest.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()
