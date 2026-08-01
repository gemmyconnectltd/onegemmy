import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.variant import ProductVariant


class VariantRepository(BaseRepository[ProductVariant]):
    model = ProductVariant

    async def get_by_id_for_product(self, product_id: uuid.UUID, id: uuid.UUID) -> ProductVariant | None:
        result = await self.db.execute(
            select(ProductVariant).where(ProductVariant.id == id, ProductVariant.product_id == product_id)
        )
        return result.scalar_one_or_none()

    async def list_for_product(self, product_id: uuid.UUID) -> list[ProductVariant]:
        result = await self.db.execute(
            select(ProductVariant)
            .where(ProductVariant.product_id == product_id)
            .order_by(ProductVariant.created_at)
        )
        return list(result.scalars().all())

    async def count_for_product(self, product_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(ProductVariant).where(ProductVariant.product_id == product_id)
        )
        return result.scalar_one()

    async def list_for_tenant(self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[ProductVariant]:
        result = await self.db.execute(
            select(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .join(Product, Product.id == ProductVariant.product_id)
            .where(Product.tenant_id == tenant_id)
            .order_by(Product.name, ProductVariant.created_at)
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count())
            .select_from(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(Product.tenant_id == tenant_id)
        )
        return result.scalar_one()
