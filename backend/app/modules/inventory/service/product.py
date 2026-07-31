import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.inventory.models.product import Product
from app.modules.inventory.repository import ProductRepository
from app.modules.inventory.schemas import ProductCreate, ProductRead, ProductUpdate


async def get_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    return ProductRead.model_validate(obj)


async def list_products(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[ProductRead]:
    items = await ProductRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [ProductRead.model_validate(i) for i in items]


async def count_products(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await ProductRepository(db).count_for_tenant(tenant_id)


async def create_product(db: AsyncSession, tenant_id: uuid.UUID, data: ProductCreate) -> ProductRead:
    obj = Product(tenant_id=tenant_id, **data.model_dump())
    obj = await ProductRepository(db).save(obj)
    await db.commit()
    return ProductRead.model_validate(obj)


async def update_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ProductUpdate) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await ProductRepository(db).save(obj)
    await db.commit()
    return ProductRead.model_validate(obj)


async def delete_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    await ProductRepository(db).delete(obj)
    await db.commit()
