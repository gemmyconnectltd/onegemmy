import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.crm.models.campaign import Campaign


class CampaignRepository(BaseRepository[Campaign]):
    model = Campaign

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Campaign | None:
        result = await self.db.execute(
            select(Campaign).where(Campaign.id == id, Campaign.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[Campaign]:
        result = await self.db.execute(
            select(Campaign)
            .where(Campaign.tenant_id == tenant_id)
            .order_by(Campaign.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Campaign).where(Campaign.tenant_id == tenant_id)
        )
        return result.scalar_one()
