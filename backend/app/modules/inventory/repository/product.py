import uuid

from sqlalchemy import func, or_, select
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

    async def get_by_barcode(self, tenant_id: uuid.UUID, barcode: str) -> Product | None:
        result = await self.db.execute(
            select(Product)
            .options(*_with_relations())
            .where(Product.tenant_id == tenant_id, Product.barcode == barcode)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20, search: str | None = None
    ) -> list[Product]:
        stmt = (
            select(Product)
            .options(*_with_relations())
            .where(Product.tenant_id == tenant_id)
        )
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like)))
        stmt = stmt.order_by(Product.name).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Product).where(Product.tenant_id == tenant_id)
        )
        return result.scalar_one()

    async def list_low_stock(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 50) -> list[Product]:
        result = await self.db.execute(
            select(Product)
            .options(*_with_relations())
            .where(Product.tenant_id == tenant_id, Product.stock <= Product.min_stock)
            .order_by(Product.name)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_low_stock(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Product).where(
                Product.tenant_id == tenant_id, Product.stock <= Product.min_stock
            )
        )
        return result.scalar_one()
