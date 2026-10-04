import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.tenants.models import User
from app.modules.tenants.models.role import Role


class UserRepository(BaseRepository[User]):
    model = User

    _with_role = (
        selectinload(User.role_rel).selectinload(Role.permissions),
        selectinload(User.tenant),
        selectinload(User.branch_rel),
    )

    def _filtered(
        self,
        tenant_id: uuid.UUID,
        search: str | None,
        is_active: bool | None,
        role_id: uuid.UUID | None,
    ):
        """Shared WHERE builder for the users list and its COUNT twin, so the
        two can never drift apart and paginate over a different row set than
        the one that was counted."""
        stmt = select(User).where(User.tenant_id == tenant_id)
        if search:
            like = f"%{search.strip()}%"
            stmt = stmt.where(
                or_(
                    User.full_name.ilike(like),
                    User.email.ilike(like),
                    User.phone.ilike(like),
                )
            )
        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if role_id is not None:
            stmt = stmt.where(User.role_id == role_id)
        return stmt

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

    async def list_for_tenant(
        self,
        tenant_id: uuid.UUID,
        offset: int,
        limit: int,
        search: str | None = None,
        is_active: bool | None = None,
        role_id: uuid.UUID | None = None,
    ) -> list[User]:
        stmt = (
            self._filtered(tenant_id, search, is_active, role_id)
            .options(*self._with_role)
            .order_by(User.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(
        self,
        tenant_id: uuid.UUID,
        search: str | None = None,
        is_active: bool | None = None,
        role_id: uuid.UUID | None = None,
    ) -> int:
        stmt = self._filtered(tenant_id, search, is_active, role_id).subquery()
        result = await self.db.execute(select(func.count()).select_from(stmt))
        return result.scalar_one()

    async def count_active_admins(self, tenant_id: uuid.UUID) -> int:
        """Guards against a tenant locking itself out: the last active
        Admin (or the tenant owner) can't be demoted or deactivated."""
        result = await self.db.execute(
            select(func.count())
            .select_from(User)
            .where(
                User.tenant_id == tenant_id,
                User.is_active.is_(True),
                (User.is_superuser.is_(True)) | (User.role == "admin"),
            )
        )
        return result.scalar_one()
