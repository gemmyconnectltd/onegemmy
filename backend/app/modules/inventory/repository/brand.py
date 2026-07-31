import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.inventory.models.brand import Brand


class BrandRepository(BaseRepository[Brand]):
    model = Brand

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Brand | None:
        result = await self.db.execute(
            select(Brand).where(Brand.id == id, Brand.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Brand]:
        result = await self.db.execute(
            select(Brand).where(Brand.tenant_id == tenant_id).order_by(Brand.name).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Brand).where(Brand.tenant_id == tenant_id)
        )
        return result.scalar_one()
