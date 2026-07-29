import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.tenants.models import Department, Shop, Tenant


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


class ShopRepository(BaseRepository[Shop]):
    model = Shop

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, shop_id: uuid.UUID) -> Shop | None:
        result = await self.db.execute(
            select(Shop).where(Shop.id == shop_id, Shop.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Shop]:
        result = await self.db.execute(
            select(Shop)
            .where(Shop.tenant_id == tenant_id)
            .order_by(Shop.name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Shop).where(Shop.tenant_id == tenant_id)
        )
        return result.scalar_one()


class TenantRepository(BaseRepository[Tenant]):
    model = Tenant

    async def get_by_slug(self, slug: str) -> Tenant | None:
        result = await self.db.execute(select(Tenant).where(Tenant.slug == slug))
        return result.scalar_one_or_none()

    async def list_all(self, offset: int = 0, limit: int = 20) -> list[Tenant]:
        result = await self.db.execute(
            select(Tenant).order_by(Tenant.created_at.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_all(self) -> int:
        result = await self.db.execute(select(func.count()).select_from(Tenant))
        return result.scalar_one()
