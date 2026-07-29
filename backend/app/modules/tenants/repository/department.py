import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.tenants.models import Department


class DepartmentRepository(BaseRepository[Department]):
    model = Department

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, dept_id: uuid.UUID) -> Department | None:
        result = await self.db.execute(
            select(Department).where(Department.id == dept_id, Department.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_name(self, tenant_id: uuid.UUID, name: str) -> Department | None:
        result = await self.db.execute(
            select(Department).where(Department.tenant_id == tenant_id, Department.name == name)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Department]:
        result = await self.db.execute(
            select(Department)
            .where(Department.tenant_id == tenant_id)
            .order_by(Department.name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Department).where(Department.tenant_id == tenant_id)
        )
        return result.scalar_one()
