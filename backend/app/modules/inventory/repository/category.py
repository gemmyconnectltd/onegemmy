import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.inventory.models.category import Category


class CategoryRepository(BaseRepository[Category]):
    model = Category

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Category | None:
        result = await self.db.execute(
            select(Category).where(Category.id == id, Category.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Category]:
        result = await self.db.execute(
            select(Category).where(Category.tenant_id == tenant_id).order_by(Category.name).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Category).where(Category.tenant_id == tenant_id)
        )
        return result.scalar_one()
