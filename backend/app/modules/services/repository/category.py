import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.services.models.category import ServiceCategory


class ServiceCategoryRepository(BaseRepository[ServiceCategory]):
    model = ServiceCategory

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> ServiceCategory | None:
        result = await self.db.execute(
            select(ServiceCategory).where(ServiceCategory.id == id, ServiceCategory.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name_for_tenant(self, tenant_id: uuid.UUID, name: str) -> ServiceCategory | None:
        result = await self.db.execute(
            select(ServiceCategory).where(ServiceCategory.tenant_id == tenant_id, ServiceCategory.name == name)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[ServiceCategory]:
        result = await self.db.execute(
            select(ServiceCategory)
            .where(ServiceCategory.tenant_id == tenant_id)
            .order_by(ServiceCategory.name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def list_all_for_tenant(self, tenant_id: uuid.UUID) -> list[ServiceCategory]:
        result = await self.db.execute(
            select(ServiceCategory).where(ServiceCategory.tenant_id == tenant_id).order_by(ServiceCategory.name)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(ServiceCategory).where(ServiceCategory.tenant_id == tenant_id)
        )
        return result.scalar_one()
