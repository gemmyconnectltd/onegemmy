import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.tenants.models import Branch


class BranchRepository(BaseRepository[Branch]):
    model = Branch

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> Branch | None:
        result = await self.db.execute(
            select(Branch).where(Branch.id == branch_id, Branch.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Branch]:
        result = await self.db.execute(
            select(Branch)
            .where(Branch.tenant_id == tenant_id)
            .order_by(Branch.name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Branch).where(Branch.tenant_id == tenant_id)
        )
        return result.scalar_one()
