import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.tenants.models import Role


class RoleRepository(BaseRepository[Role]):
    model = Role

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, role_id: uuid.UUID) -> Role | None:
        result = await self.db.execute(
            select(Role).where(Role.id == role_id, Role.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name_for_tenant(self, tenant_id: uuid.UUID, name: str) -> Role | None:
        result = await self.db.execute(
            select(Role).where(func.lower(Role.name) == name.strip().lower(), Role.tenant_id == tenant_id)
            .order_by((Role.name == name).desc(), Role.created_at, Role.id).limit(1)
        )
        return result.scalar_one_or_none()

    async def template_roles(self, tenant_id: uuid.UUID) -> list[Role]:
        names = {"Admin", "Member", "Viewer", "Owner/CEO", "General Manager", "Branch Manager", "Factory Manager", "Cashier", "Accountant", "Inventory Officer"}
        result = await self.db.execute(select(Role).where(Role.tenant_id == tenant_id, Role.name.in_(names)))
        return list(result.scalars().all())

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
        result = await self.db.execute(
            select(func.count()).select_from(Role).where(Role.tenant_id == tenant_id)
        )
        return result.scalar_one()
