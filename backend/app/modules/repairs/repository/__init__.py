import uuid

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.repairs.models.job import RepairJob


class RepairJobRepository(BaseRepository[RepairJob]):
    model = RepairJob

    def _opts(self):
        return [selectinload(RepairJob.parts), selectinload(RepairJob.customer), selectinload(RepairJob.technician)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> RepairJob | None:
        result = await self.db.execute(
            select(RepairJob).options(*self._opts())
            .where(RepairJob.id == id, RepairJob.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None, offset: int, limit: int) -> list[RepairJob]:
        stmt = select(RepairJob).options(*self._opts()).where(RepairJob.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(RepairJob.status == status)
        stmt = stmt.order_by(RepairJob.received_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None) -> int:
        stmt = select(func.count()).select_from(RepairJob).where(RepairJob.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(RepairJob.status == status)
        return (await self.db.execute(stmt)).scalar_one()

    async def next_job_number(self, tenant_id: uuid.UUID) -> str:
        # MAX of the existing numeric suffix, not COUNT(*) — see sales/order.py's
        # next_order_number for why COUNT collides once anything is deleted.
        current_max = (await self.db.execute(
            select(func.max(cast(func.substring(RepairJob.job_number, 5), Integer)))
            .where(RepairJob.tenant_id == tenant_id)
        )).scalar_one() or 0
        return f"REP-{str(current_max + 1).zfill(4)}"
