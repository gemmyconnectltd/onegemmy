import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.repository import BaseRepository
from app.modules.services.models.service import Service


class ServiceRepository(BaseRepository[Service]):
    model = Service

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Service | None:
        result = await self.db.execute(
            select(Service)
            .options(joinedload(Service.category))
            .where(Service.id == id, Service.tenant_id == tenant_id)
        )
        return result.unique().scalar_one_or_none()

    async def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        offset: int = 0,
        limit: int = 20,
        search: str | None = None,
        category_id: uuid.UUID | None = None,
        is_active: bool | None = None,
    ) -> list[Service]:
        stmt = (
            select(Service)
            .options(joinedload(Service.category))
            .where(Service.tenant_id == tenant_id)
        )
        if search:
            stmt = stmt.where(Service.name.ilike(f"%{search}%"))
        if category_id is not None:
            stmt = stmt.where(Service.category_id == category_id)
        if is_active is not None:
            stmt = stmt.where(Service.is_active == is_active)
        stmt = stmt.order_by(Service.name).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.unique().scalars().all())

    async def count_for_tenant(
        self,
        tenant_id: uuid.UUID,
        search: str | None = None,
        category_id: uuid.UUID | None = None,
        is_active: bool | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(Service).where(Service.tenant_id == tenant_id)
        if search:
            stmt = stmt.where(Service.name.ilike(f"%{search}%"))
        if category_id is not None:
            stmt = stmt.where(Service.category_id == category_id)
        if is_active is not None:
            stmt = stmt.where(Service.is_active == is_active)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def list_all_for_tenant(self, tenant_id: uuid.UUID) -> list[Service]:
        """Unpaginated — for pickers (New Appointment / New Walk-in service select)."""
        result = await self.db.execute(
            select(Service)
            .options(joinedload(Service.category))
            .where(Service.tenant_id == tenant_id, Service.is_active.is_(True))
            .order_by(Service.name)
        )
        return list(result.unique().scalars().all())

    async def list_all_names_for_tenant(self, tenant_id: uuid.UUID) -> list[str]:
        """Every service name for this tenant regardless of active status — used
        to dedupe template imports against services a tenant may have since
        deactivated rather than deleted."""
        result = await self.db.execute(select(Service.name).where(Service.tenant_id == tenant_id))
        return list(result.scalars().all())
