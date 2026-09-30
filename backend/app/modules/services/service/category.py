import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.services.models.category import ServiceCategory
from app.modules.services.repository import ServiceCategoryRepository
from app.modules.services.schemas import (
    ServiceCategoryCreate,
    ServiceCategoryRead,
    ServiceCategoryUpdate,
)


async def get_service_category(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ServiceCategoryRead:
    obj = await ServiceCategoryRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Service category not found")
    return ServiceCategoryRead.model_validate(obj)


async def list_service_categories(
    db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20
) -> list[ServiceCategoryRead]:
    items = await ServiceCategoryRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [ServiceCategoryRead.model_validate(i) for i in items]


async def count_service_categories(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await ServiceCategoryRepository(db).count_for_tenant(tenant_id)


async def create_service_category(
    db: AsyncSession, tenant_id: uuid.UUID, data: ServiceCategoryCreate
) -> ServiceCategoryRead:
    obj = ServiceCategory(tenant_id=tenant_id, **data.model_dump())
    obj = await ServiceCategoryRepository(db).save(obj)
    await db.commit()
    return ServiceCategoryRead.model_validate(obj)


async def update_service_category(
    db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ServiceCategoryUpdate
) -> ServiceCategoryRead:
    obj = await ServiceCategoryRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Service category not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await ServiceCategoryRepository(db).save(obj)
    await db.commit()
    return ServiceCategoryRead.model_validate(obj)


async def delete_service_category(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ServiceCategoryRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Service category not found")
    await ServiceCategoryRepository(db).delete(obj)
    await db.commit()
