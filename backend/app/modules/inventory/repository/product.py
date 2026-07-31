import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.inventory.models.product import Product


def _with_relations():
    return [
        selectinload(Product.category),
        selectinload(Product.brand),
        selectinload(Product.unit),
        selectinload(Product.supplier),
    ]


class ProductRepository(BaseRepository[Product]):
    model = Product

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Product | None:
        result = await self.db.execute(
            select(Product)
            .options(*_with_relations())
            .where(Product.id == id, Product.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Product]:
        result = await self.db.execute(
            select(Product)
            .options(*_with_relations())
            .where(Product.tenant_id == tenant_id)
            .order_by(Product.name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Product).where(Product.tenant_id == tenant_id)
        )
        return result.scalar_one()
