import uuid

from sqlalchemy import func, select, update

from app.core.repository import BaseRepository
from app.modules.tenants.models import Branch


class BranchRepository(BaseRepository[Branch]):
    model = Branch

    async def names_for_ids(self, tenant_id: uuid.UUID, ids: set[uuid.UUID]) -> dict:
        if not ids:
            return {}
        rows = await self.db.execute(select(Branch.id, Branch.name).where(
            Branch.tenant_id == tenant_id, Branch.id.in_(ids),
        ))
        return dict(rows.all())

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> Branch | None:
        result = await self.db.execute(
            select(Branch).where(Branch.id == branch_id, Branch.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_main_for_tenant(self, tenant_id: uuid.UUID) -> Branch | None:
        result = await self.db.execute(
            select(Branch).where(Branch.tenant_id == tenant_id, Branch.is_main.is_(True))
        )
        return result.scalar_one_or_none()

    async def clear_main_for_tenant(self, tenant_id: uuid.UUID, except_branch_id: uuid.UUID | None = None) -> None:
        """Unsets is_main on every branch of this tenant except `except_branch_id`,
        so a new main branch can be set without ever having two at once."""
        stmt = update(Branch).where(Branch.tenant_id == tenant_id, Branch.is_main.is_(True))
        if except_branch_id is not None:
            stmt = stmt.where(Branch.id != except_branch_id)
        await self.db.execute(stmt.values(is_main=False))

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20, ids: list[uuid.UUID] | None = None) -> list[Branch]:
        result = await self.db.execute(
            select(Branch)
            .where(Branch.tenant_id == tenant_id, *([Branch.id.in_(ids)] if ids is not None else []))
            .order_by(Branch.name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, ids: list[uuid.UUID] | None = None) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Branch).where(Branch.tenant_id == tenant_id, *([Branch.id.in_(ids)] if ids is not None else []))
        )
        return result.scalar_one()
