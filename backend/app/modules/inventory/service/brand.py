import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.inventory.models.brand import Brand
from app.modules.inventory.repository import BrandRepository
from app.modules.inventory.schemas import BrandCreate, BrandRead, BrandUpdate


async def get_brand(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> BrandRead:
    obj = await BrandRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Brand not found")
    return BrandRead.model_validate(obj)


async def list_brands(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[BrandRead]:
    items = await BrandRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [BrandRead.model_validate(i) for i in items]


async def count_brands(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await BrandRepository(db).count_for_tenant(tenant_id)


async def create_brand(db: AsyncSession, tenant_id: uuid.UUID, data: BrandCreate) -> BrandRead:
    obj = Brand(tenant_id=tenant_id, **data.model_dump())
    obj = await BrandRepository(db).save(obj)
    await db.commit()
    return BrandRead.model_validate(obj)


async def update_brand(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: BrandUpdate) -> BrandRead:
    obj = await BrandRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Brand not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await BrandRepository(db).save(obj)
    await db.commit()
    return BrandRead.model_validate(obj)


async def delete_brand(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await BrandRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Brand not found")
    await BrandRepository(db).delete(obj)
    await db.commit()
