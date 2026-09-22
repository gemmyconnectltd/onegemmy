import uuid

from sqlalchemy import func, or_, select

from app.core.repository import BaseRepository
from app.modules.inventory.models.supplier import Supplier


class SupplierRepository(BaseRepository[Supplier]):
    model = Supplier

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Supplier | None:
        result = await self.db.execute(
            select(Supplier).where(Supplier.id == id, Supplier.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20, search: str | None = None
    ) -> list[Supplier]:
        stmt = select(Supplier).where(Supplier.tenant_id == tenant_id)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Supplier.name.ilike(like), Supplier.email.ilike(like), Supplier.phone.ilike(like)))
        stmt = stmt.order_by(Supplier.name).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, search: str | None = None) -> int:
        stmt = select(func.count()).select_from(Supplier).where(Supplier.tenant_id == tenant_id)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Supplier.name.ilike(like), Supplier.email.ilike(like), Supplier.phone.ilike(like)))
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def list_identities_for_tenant(self, tenant_id: uuid.UUID) -> list[tuple[str | None, str]]:
        """Returns every (email, name) for a tenant — used by import dedupe so a
        bulk insert never runs a per-row lookup for each record."""
        result = await self.db.execute(
            select(Supplier.email, Supplier.name).where(Supplier.tenant_id == tenant_id)
        )
        return list(result.all())
