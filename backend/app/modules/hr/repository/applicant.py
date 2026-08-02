import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.hr.models.applicant import Applicant


class ApplicantRepository(BaseRepository[Applicant]):
    model = Applicant

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Applicant | None:
        result = await self.db.execute(
            select(Applicant).where(Applicant.id == id, Applicant.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, stage: str | None = None, offset: int = 0, limit: int = 50) -> list[Applicant]:
        stmt = select(Applicant).where(Applicant.tenant_id == tenant_id)
        if stage:
            stmt = stmt.where(Applicant.stage == stage)
        stmt = stmt.order_by(Applicant.applied_date.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, stage: str | None = None) -> int:
        stmt = select(func.count()).select_from(Applicant).where(Applicant.tenant_id == tenant_id)
        if stage:
            stmt = stmt.where(Applicant.stage == stage)
        result = await self.db.execute(stmt)
        return result.scalar_one()
