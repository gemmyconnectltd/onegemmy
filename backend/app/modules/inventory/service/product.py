import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.integrations.storage import storage
from app.modules.inventory.models.product import Product
from app.modules.inventory.repository import ProductRepository
from app.modules.inventory.schemas import (
    ProductBulkCreate, ProductBulkResult,
    ProductCreate, ProductRead, ProductUpdate, RestockRequest,
)


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
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    return ProductRead.model_validate(obj)


async def bulk_create_products(db: AsyncSession, tenant_id: uuid.UUID, data: ProductBulkCreate) -> ProductBulkResult:
    repo = ProductRepository(db)
    created = 0
    errors: list[str] = []
    for item in data.items:
        try:
            obj = Product(tenant_id=tenant_id, **item.model_dump())
            await repo.save(obj)
            created += 1
        except Exception as e:
            await db.rollback()
            errors.append(f"{item.name or item.sku}: {str(e)}")
    if created > 0:
        await db.commit()
    return ProductBulkResult(created=created, failed=len(errors), errors=errors)


async def update_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ProductUpdate) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await ProductRepository(db).save(obj)
    await db.commit()
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    return ProductRead.model_validate(obj)


async def delete_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if obj.image_url:
        await storage.delete(obj.image_url)
    await ProductRepository(db).delete(obj)
    await db.commit()


async def upload_product_image(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, filename: str, content: bytes) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if obj.image_url:
        await storage.delete(obj.image_url)
    url = await storage.save("products", filename, content)
    obj.image_url = url
    obj = await ProductRepository(db).save(obj)
    await db.commit()
    return ProductRead.model_validate(obj)


async def delete_product_image(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if obj.image_url:
        await storage.delete(obj.image_url)
        obj.image_url = None
        obj = await ProductRepository(db).save(obj)
        await db.commit()
    return ProductRead.model_validate(obj)


async def restock_product(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: RestockRequest) -> ProductRead:
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Product not found")
    if data.mode == "adjust":
        obj.stock = data.qty
    else:
        obj.stock = obj.stock + data.qty
    obj = await ProductRepository(db).save(obj)
    await db.commit()
    obj = await ProductRepository(db).get_by_id_for_tenant(tenant_id, id)
    return ProductRead.model_validate(obj)
