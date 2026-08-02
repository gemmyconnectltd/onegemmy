import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.tenants.models import User
from app.modules.tenants.models.role import Role


class UserRepository(BaseRepository[User]):
    model = User

    _with_role = (
        selectinload(User.role_rel).selectinload(Role.permissions),
        selectinload(User.tenant),
    )

    async def get(self, id: uuid.UUID) -> User | None:  # type: ignore[override]
        result = await self.db.execute(
            select(User).options(*self._with_role).where(User.id == id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> User | None:
        result = await self.db.execute(
            select(User).options(*self._with_role).where(User.id == user_id, User.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, tenant_id: uuid.UUID, email: str) -> User | None:
        result = await self.db.execute(
            select(User).options(*self._with_role).where(User.email == email, User.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email_global(self, email: str) -> User | None:
        result = await self.db.execute(
            select(User).options(*self._with_role).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int, limit: int) -> list[User]:
        result = await self.db.execute(
            select(User)
            .options(*self._with_role)
            .where(User.tenant_id == tenant_id)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(User).where(User.tenant_id == tenant_id)
        )
        return result.scalar_one()
