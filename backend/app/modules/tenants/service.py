import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.modules.tenants.models import Department, Shop, Tenant
from app.modules.tenants.repository import DepartmentRepository, ShopRepository, TenantRepository
from app.modules.tenants.schemas import (
    DepartmentCreate,
    DepartmentUpdate,
    ShopCreate,
    ShopUpdate,
    TenantCreate,
    TenantUpdate,
)
from app.shared.utils import slugify

log = get_logger("tenants")


async def get_department(db: AsyncSession, tenant_id: uuid.UUID, dept_id: uuid.UUID) -> Department:
    dept = await DepartmentRepository(db).get_by_id_for_tenant(tenant_id, dept_id)
    if dept is None:
        raise NotFoundError("Department not found")
    return dept


async def list_departments(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Department]:
    return await DepartmentRepository(db).list_for_tenant(tenant_id, offset, limit)


async def count_departments(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await DepartmentRepository(db).count_for_tenant(tenant_id)


async def create_department(db: AsyncSession, tenant_id: uuid.UUID, data: DepartmentCreate) -> Department:
    existing = await DepartmentRepository(db).get_by_name(tenant_id, data.name)
    if existing:
        raise ConflictError("Department with this name already exists")
    dept = Department(tenant_id=tenant_id, name=data.name, description=data.description)
    return await DepartmentRepository(db).save(dept)


async def update_department(db: AsyncSession, dept: Department, data: DepartmentUpdate) -> Department:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)
    return await DepartmentRepository(db).save(dept)


async def delete_department(db: AsyncSession, dept: Department) -> None:
    await DepartmentRepository(db).delete(dept)


async def get_shop(db: AsyncSession, tenant_id: uuid.UUID, shop_id: uuid.UUID) -> Shop:
    shop = await ShopRepository(db).get_by_id_for_tenant(tenant_id, shop_id)
    if shop is None:
        raise NotFoundError("Shop not found")
    return shop


async def list_shops(db: AsyncSession, tenant_id: uuid.UUID, offset: int = 0, limit: int = 20) -> list[Shop]:
    return await ShopRepository(db).list_for_tenant(tenant_id, offset, limit)


async def count_shops(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await ShopRepository(db).count_for_tenant(tenant_id)


async def create_shop(db: AsyncSession, tenant_id: uuid.UUID, data: ShopCreate) -> Shop:
    shop = Shop(tenant_id=tenant_id, **data.model_dump())
    return await ShopRepository(db).save(shop)


async def update_shop(db: AsyncSession, shop: Shop, data: ShopUpdate) -> Shop:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)
    return await ShopRepository(db).save(shop)


async def delete_shop(db: AsyncSession, shop: Shop) -> None:
    await ShopRepository(db).delete(shop)


async def get_by_id(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        log.warning("tenants.get_by_id.not_found", extra={"_extra_fields": {"tenant_id": str(tenant_id)}})
        raise NotFoundError("Company not found")
    return tenant


async def get_by_slug(db: AsyncSession, slug: str) -> Tenant | None:
    return await TenantRepository(db).get_by_slug(slug)


async def create(db: AsyncSession, name: str, slug: str, **kwargs) -> Tenant:
    log.info("tenants.create.attempt", extra={"_extra_fields": {"name": name, "slug": slug}})
    tenant = Tenant(name=name, slug=slug, **kwargs)
    tenant = await TenantRepository(db).save(tenant)
    log.info("tenants.create.success", extra={"_extra_fields": {"tenant_id": str(tenant.id)}})
    return tenant


async def create_tenant(db: AsyncSession, data: TenantCreate) -> Tenant:
    slug = data.slug or slugify(data.name)
    if not data.slug:
        existing = await get_by_slug(db, slug)
        if existing:
            slug = f"{slug}-{uuid.uuid4().hex[:4]}"
    log.info("tenants.create_tenant.attempt", extra={"_extra_fields": {"name": data.name, "slug": slug}})

    existing = await get_by_slug(db, slug)
    if existing:
        log.warning("tenants.create_tenant.conflict", extra={"_extra_fields": {"slug": slug}})
        raise ConflictError("Company with this slug already exists")

    extra_fields = data.model_dump(exclude={"name", "slug"}, exclude_unset=True)
    tenant = await create(db, data.name, slug, **extra_fields)
    log.info("tenants.create_tenant.success", extra={"_extra_fields": {"tenant_id": str(tenant.id)}})
    return tenant


async def list_all(db: AsyncSession, offset: int = 0, limit: int = 20) -> list[Tenant]:
    return await TenantRepository(db).list_all(offset, limit)


async def count_all(db: AsyncSession) -> int:
    return await TenantRepository(db).count_all()


async def update(db: AsyncSession, tenant: Tenant, data: TenantUpdate) -> Tenant:
    fields = list(data.model_dump(exclude_unset=True).keys())
    log.info("tenants.update.attempt", extra={"_extra_fields": {"tenant_id": str(tenant.id), "fields": fields}})

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    tenant = await TenantRepository(db).save(tenant)
    log.info("tenants.update.success", extra={"_extra_fields": {"tenant_id": str(tenant.id)}})
    return tenant


async def delete(db: AsyncSession, tenant: Tenant) -> None:
    log.info("tenants.delete.attempt", extra={"_extra_fields": {"tenant_id": str(tenant.id), "name": tenant.name}})
    await TenantRepository(db).delete(tenant)
    log.info("tenants.delete.success", extra={"_extra_fields": {"tenant_id": str(tenant.id)}})
