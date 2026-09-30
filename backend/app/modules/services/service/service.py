import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.services.data.service_templates import SERVICE_TEMPLATES
from app.modules.services.models.category import ServiceCategory
from app.modules.services.models.service import Service
from app.modules.services.repository import ServiceCategoryRepository, ServiceRepository
from app.modules.services.schemas import (
    ServiceCreate,
    ServiceImportItem,
    ServiceImportResult,
    ServiceRead,
    ServiceTemplateRead,
    ServiceTemplatesRead,
    ServiceUpdate,
)
from app.modules.tenants.repository import TenantRepository


async def get_service(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ServiceRead:
    obj = await ServiceRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Service not found")
    return ServiceRead.model_validate(obj)


async def list_services(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    offset: int = 0,
    limit: int = 20,
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    is_active: bool | None = None,
) -> list[ServiceRead]:
    items = await ServiceRepository(db).list_for_tenant(tenant_id, offset, limit, search, category_id, is_active)
    return [ServiceRead.model_validate(i) for i in items]


async def count_services(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    search: str | None = None,
    category_id: uuid.UUID | None = None,
    is_active: bool | None = None,
) -> int:
    return await ServiceRepository(db).count_for_tenant(tenant_id, search, category_id, is_active)


async def list_all_services(db: AsyncSession, tenant_id: uuid.UUID) -> list[ServiceRead]:
    items = await ServiceRepository(db).list_all_for_tenant(tenant_id)
    return [ServiceRead.model_validate(i) for i in items]


async def create_service(db: AsyncSession, tenant_id: uuid.UUID, data: ServiceCreate) -> ServiceRead:
    obj = Service(tenant_id=tenant_id, **data.model_dump())
    obj = await ServiceRepository(db).save(obj)
    obj = await ServiceRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    await db.commit()
    return ServiceRead.model_validate(obj)


async def update_service(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ServiceUpdate) -> ServiceRead:
    obj = await ServiceRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Service not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    obj = await ServiceRepository(db).save(obj)
    obj = await ServiceRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
    await db.commit()
    return ServiceRead.model_validate(obj)


async def delete_service(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ServiceRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Service not found")
    await ServiceRepository(db).delete(obj)
    await db.commit()


async def get_service_templates(db: AsyncSession, tenant_id: uuid.UUID) -> ServiceTemplatesRead:
    tenant = await TenantRepository(db).get(tenant_id)
    existing = await ServiceRepository(db).list_all_names_for_tenant(tenant_id)

    return ServiceTemplatesRead(
        tenant_industry=tenant.industry if tenant else None,
        existing=existing,
        templates=[ServiceTemplateRead.model_validate(t) for t in SERVICE_TEMPLATES],
    )


async def import_services(
    db: AsyncSession, tenant_id: uuid.UUID, items: list[ServiceImportItem]
) -> ServiceImportResult:
    existing_names = await ServiceRepository(db).list_all_names_for_tenant(tenant_id)
    existing_lower = {n.strip().lower() for n in existing_names}

    categories = await ServiceCategoryRepository(db).list_all_for_tenant(tenant_id)
    category_by_name = {c.name.strip().lower(): c for c in categories}

    created: list[ServiceRead] = []
    skipped: list[str] = []
    for item in items:
        name = item.name.strip()
        if not name or name.lower() in existing_lower:
            skipped.append(item.name)
            continue

        category_key = item.category_name.strip().lower()
        category = category_by_name.get(category_key)
        if category is None:
            category = ServiceCategory(tenant_id=tenant_id, name=item.category_name.strip())
            category = await ServiceCategoryRepository(db).save(category)
            category_by_name[category_key] = category

        obj = Service(
            tenant_id=tenant_id,
            name=name,
            category_id=category.id,
            duration_minutes=item.duration_minutes,
            price=0,
            cost=0,
        )
        obj = await ServiceRepository(db).save(obj)
        obj = await ServiceRepository(db).get_by_id_for_tenant(tenant_id, obj.id)
        created.append(ServiceRead.model_validate(obj))
        existing_lower.add(name.lower())

    await db.commit()
    return ServiceImportResult(created=created, skipped=skipped)
