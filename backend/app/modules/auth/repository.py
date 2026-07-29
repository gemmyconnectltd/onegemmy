import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.auth.models import Permission, Role, role_permissions


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
        result = await self.db.execute(
            select(func.count()).select_from(Role).where(Role.tenant_id == tenant_id)
        )
        return result.scalar_one()


class PermissionRepository(BaseRepository[Permission]):
    model = Permission

    async def get_by_name(self, name: str) -> Permission | None:
        result = await self.db.execute(select(Permission).where(Permission.name == name))
        return result.scalar_one_or_none()

    async def list_all(self, offset: int = 0, limit: int = 100) -> list[Permission]:
        result = await self.db.execute(
            select(Permission).order_by(Permission.resource, Permission.action).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_all(self) -> int:
        result = await self.db.execute(select(func.count()).select_from(Permission))
        return result.scalar_one()

    async def get_by_ids(self, ids: list[uuid.UUID]) -> list[Permission]:
        if not ids:
            return []
        result = await self.db.execute(select(Permission).where(Permission.id.in_(ids)))
        return list(result.scalars().all())

    async def get_permissions_for_role(self, role_id: uuid.UUID) -> list[Permission]:
        result = await self.db.execute(
            select(Permission)
            .join(role_permissions, Permission.id == role_permissions.c.permission_id)
            .where(role_permissions.c.role_id == role_id)
        )
        return list(result.scalars().all())

    async def assign_permissions_to_role(self, role_id: uuid.UUID, permission_ids: list[uuid.UUID]) -> None:
        await self.db.execute(role_permissions.delete().where(role_permissions.c.role_id == role_id))
        for pid in permission_ids:
            await self.db.execute(role_permissions.insert().values(role_id=role_id, permission_id=pid))
        await self.db.commit()

    async def get_permissions_for_user(self, tenant_id: uuid.UUID, role_id: uuid.UUID) -> list[Permission]:
        result = await self.db.execute(
            select(Permission)
            .join(role_permissions, Permission.id == role_permissions.c.permission_id)
            .join(Role, Role.id == role_permissions.c.role_id)
            .where(Role.id == role_id, Role.tenant_id == tenant_id)
        )
        return list(result.scalars().all())
