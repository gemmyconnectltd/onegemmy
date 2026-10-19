"""Tenant-scoped batch locks used when receiving goods and changing catalog prices."""
import uuid

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.supplier import Supplier
from app.modules.inventory.models.variant import ProductVariant
from app.modules.tenants.models import User
from app.modules.tenants.models.role import Role


class PurchasePricingRepository(BaseRepository[Product]):
    model = Product

    async def actor(self, tenant_id: uuid.UUID, user_id: uuid.UUID) -> User | None:
        return (await self.db.execute(select(User).options(selectinload(User.role_rel).selectinload(Role.permissions)).where(User.id == user_id, User.tenant_id == tenant_id))).scalar_one_or_none()

    async def catalog(self, tenant_id: uuid.UUID, items):
        variant_ids = {item.variant_id for item in items if item.variant_id}
        variants = list((await self.db.execute(select(ProductVariant).join(Product, Product.id == ProductVariant.product_id).where(Product.tenant_id == tenant_id, ProductVariant.id.in_(variant_ids)).order_by(ProductVariant.id).with_for_update(of=ProductVariant))).scalars()) if variant_ids else []
        product_ids = {item.product_id for item in items if item.product_id} | {v.product_id for v in variants}
        products = list((await self.db.execute(select(Product).where(Product.tenant_id == tenant_id, Product.id.in_(product_ids)).order_by(Product.id).with_for_update(of=Product))).scalars()) if product_ids else []
        return {p.id: p for p in products}, {v.id: v for v in variants}

    async def supplier(self, tenant_id: uuid.UUID, supplier_id: uuid.UUID) -> bool:
        return await self.db.scalar(select(Supplier.id).where(Supplier.tenant_id == tenant_id, Supplier.id == supplier_id)) is not None
