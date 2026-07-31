import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.inventory.models.category import Category
from app.modules.inventory.repository import CategoryRepository
from app.modules.inventory.schemas import CategoryCreate, CategoryRead, CategoryUpdate


async def get_category(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> CategoryRead:
    obj = await CategoryRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Category not found")
    return CategoryRead.model_validate(obj)


async def list_categories(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[CategoryRead]:
    items = await CategoryRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [CategoryRead.model_validate(i) for i in items]


async def count_categories(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await CategoryRepository(db).count_for_tenant(tenant_id)


async def create_category(db: AsyncSession, tenant_id: uuid.UUID, data: CategoryCreate) -> CategoryRead:
    obj = Category(tenant_id=tenant_id, **data.model_dump())
    obj = await CategoryRepository(db).save(obj)
    await db.commit()
    return CategoryRead.model_validate(obj)


async def update_category(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: CategoryUpdate) -> CategoryRead:
    obj = await CategoryRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Category not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await CategoryRepository(db).save(obj)
    await db.commit()
    return CategoryRead.model_validate(obj)


async def delete_category(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await CategoryRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Category not found")
    await CategoryRepository(db).delete(obj)
    await db.commit()
