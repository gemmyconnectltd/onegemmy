import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.permissions.models import Permission, role_permissions


class PermissionRepository(BaseRepository[Permission]):
    model = Permission

    async def get_by_name(self, name: str) -> Permission | None:
        result = await self.db.execute(
            select(Permission).where(Permission.name == name)
        )
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
        result = await self.db.execute(
            select(Permission).where(Permission.id.in_(ids))
        )
        return list(result.scalars().all())

    async def get_permissions_for_role(self, role_id: uuid.UUID) -> list[Permission]:
        result = await self.db.execute(
            select(Permission)
            .join(role_permissions, Permission.id == role_permissions.c.permission_id)
            .where(role_permissions.c.role_id == role_id)
        )
        return list(result.scalars().all())

    async def assign_permissions_to_role(self, role_id: uuid.UUID, permission_ids: list[uuid.UUID]) -> None:
        await self.db.execute(
            role_permissions.delete().where(role_permissions.c.role_id == role_id)
        )
        for pid in permission_ids:
            await self.db.execute(
                role_permissions.insert().values(role_id=role_id, permission_id=pid)
            )
        await self.db.commit()

    async def get_permissions_for_user(self, tenant_id: uuid.UUID, role_id: uuid.UUID) -> list[Permission]:
        from app.modules.roles.models import Role
        result = await self.db.execute(
            select(Permission)
            .join(role_permissions, Permission.id == role_permissions.c.permission_id)
            .join(Role, Role.id == role_permissions.c.role_id)
            .where(Role.id == role_id, Role.tenant_id == tenant_id)
        )
        return list(result.scalars().all())
