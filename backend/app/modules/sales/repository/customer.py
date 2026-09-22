import uuid

from sqlalchemy import func, or_, select

from app.core.repository import BaseRepository
from app.modules.sales.models.customer import Customer


class CustomerRepository(BaseRepository[Customer]):
    model = Customer

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Customer | None:
        result = await self.db.execute(
            select(Customer).where(Customer.id == id, Customer.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50, search: str | None = None,
        customer_type: str | None = None,
    ) -> list[Customer]:
        stmt = select(Customer).where(Customer.tenant_id == tenant_id)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Customer.name.ilike(like), Customer.email.ilike(like), Customer.phone.ilike(like)))
        if customer_type:
            stmt = stmt.where(Customer.customer_type == customer_type)
        stmt = stmt.order_by(Customer.name).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, search: str | None = None, customer_type: str | None = None) -> int:
        stmt = select(func.count()).select_from(Customer).where(Customer.tenant_id == tenant_id)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Customer.name.ilike(like), Customer.email.ilike(like), Customer.phone.ilike(like)))
        if customer_type:
            stmt = stmt.where(Customer.customer_type == customer_type)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def list_identities_for_tenant(self, tenant_id: uuid.UUID) -> list[tuple[str | None, str]]:
        """Returns every (email, name) for a tenant — used by import dedupe so a
        bulk insert never runs a per-row lookup for each record."""
        result = await self.db.execute(
            select(Customer.email, Customer.name).where(Customer.tenant_id == tenant_id)
        )
        return list(result.all())

    async def list_lookup_for_tenant(self, tenant_id: uuid.UUID) -> list[tuple[uuid.UUID, str | None, str]]:
        """Returns every (id, email, name) for a tenant — used to resolve customer
        references (by email or name) during order imports in a single query."""
        result = await self.db.execute(
            select(Customer.id, Customer.email, Customer.name).where(Customer.tenant_id == tenant_id)
        )
        return list(result.all())
