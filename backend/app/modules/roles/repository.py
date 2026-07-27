import uuid

from sqlalchemy import select

from app.core.repository import BaseRepository
from app.modules.roles.models import Role


class RoleRepository(BaseRepository[Role]):
    model = Role

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, role_id: uuid.UUID) -> Role | None:
        result = await self.db.execute(
            select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name_for_tenant(self, tenant_id: uuid.UUID, name: str) -> Role | None:
        result = await self.db.execute(
            select(Role).where(Role.name == name, Role.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int, limit: int) -> list[Role]:
        result = await self.db.execute(
            select(Role)
            .where(Role.tenant_id == tenant_id)
            .order_by(Role.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        from sqlalchemy import func
        result = await self.db.execute(
            select(func.count()).select_from(Role).where(Role.tenant_id == tenant_id)
        )
        return result.scalar_one()
