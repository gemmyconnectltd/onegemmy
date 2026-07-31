import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.sales.models.customer import Customer


class CustomerRepository(BaseRepository[Customer]):
    model = Customer

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Customer | None:
        result = await self.db.execute(
            select(Customer).where(Customer.id == id, Customer.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[Customer]:
        result = await self.db.execute(
            select(Customer)
            .where(Customer.tenant_id == tenant_id)
            .order_by(Customer.name)
            .offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id)
        )
        return result.scalar_one()
