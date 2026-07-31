import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.inventory.models.unit import Unit


class UnitRepository(BaseRepository[Unit]):
    model = Unit

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Unit | None:
        result = await self.db.execute(
            select(Unit).where(Unit.id == id, Unit.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Unit]:
        result = await self.db.execute(
            select(Unit).where(Unit.tenant_id == tenant_id).order_by(Unit.name).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Unit).where(Unit.tenant_id == tenant_id)
        )
        return result.scalar_one()
