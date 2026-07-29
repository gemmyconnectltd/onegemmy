import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.shops.models import Shop


class ShopRepository(BaseRepository[Shop]):
    model = Shop

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, shop_id: uuid.UUID) -> Shop | None:
        result = await self.db.execute(
            select(Shop).where(Shop.id == shop_id, Shop.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Shop]:
        result = await self.db.execute(
            select(Shop)
            .where(Shop.tenant_id == tenant_id)
            .order_by(Shop.name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.tenant_id == tenant_id)
        )
        return result.scalar_one()
