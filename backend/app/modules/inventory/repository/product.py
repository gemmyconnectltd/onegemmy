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

    async def lock_stock(self, tenant_id: uuid.UUID, product_ids: set[uuid.UUID],
                         variant_ids: set[uuid.UUID]) -> None:
        from app.modules.inventory.models.variant import ProductVariant
        parents = select(ProductVariant.product_id).where(ProductVariant.id.in_(variant_ids))
        await self.db.execute(select(Product).where(
            Product.tenant_id == tenant_id, or_(Product.id.in_(product_ids), Product.id.in_(parents)),
        ).order_by(Product.id).with_for_update(of=Product).execution_options(populate_existing=True))
        if variant_ids:
            await self.db.execute(select(ProductVariant).join(Product, Product.id == ProductVariant.product_id).where(
                Product.tenant_id == tenant_id, ProductVariant.id.in_(variant_ids),
            ).order_by(ProductVariant.id).with_for_update(of=ProductVariant).execution_options(populate_existing=True))

    async def valuation_products(self, tenant_id: uuid.UUID) -> list[Product]:
        # Reports need all rows; keyset batches avoid an arbitrary truncation cap.
        products: list[Product] = []
        after: uuid.UUID | None = None
        while True:
            stmt = (select(Product).options(*_with_relations(), selectinload(Product.variants))
                    .where(Product.tenant_id == tenant_id).order_by(Product.id).limit(500))
            if after is not None:
                stmt = stmt.where(Product.id > after)
            batch = list((await self.db.execute(stmt)).scalars().all())
            products.extend(batch)
            if len(batch) < 500:
                return products
            after = batch[-1].id

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

    async def get_by_sku(self, tenant_id: uuid.UUID, sku: str) -> Product | None:
        result = await self.db.execute(
            select(Product)
            .options(*_with_relations())
            .where(Product.tenant_id == tenant_id, Product.sku == sku)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(
        self, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20, search: str | None = None, is_active: bool | None = None
    ) -> list[Product]:
        stmt = (
            select(Product)
            .options(*_with_relations())
            .where(Product.tenant_id == tenant_id)
        )
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like)))
        if is_active is not None:
            stmt = stmt.where(Product.is_active == is_active)
        stmt = stmt.order_by(Product.name).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, search: str | None = None, is_active: bool | None = None) -> int:
        stmt = select(func.count()).select_from(Product).where(Product.tenant_id == tenant_id)
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like), Product.barcode.ilike(like)))
        if is_active is not None:
            stmt = stmt.where(Product.is_active == is_active)
        result = await self.db.execute(stmt)
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
