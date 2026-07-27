import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository
from app.modules.tenants.schemas import TenantCreate, TenantUpdate

log = get_logger("tenants")


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
    log.info("tenants.create_tenant.attempt", extra={"_extra_fields": {"name": data.name, "slug": data.slug}})

    existing = await get_by_slug(db, data.slug)
    if existing:
        log.warning("tenants.create_tenant.conflict", extra={"_extra_fields": {"slug": data.slug}})
        raise ConflictError("Company with this slug already exists")

    extra_fields = data.model_dump(exclude={"name", "slug"}, exclude_unset=True)
    tenant = await create(db, data.name, data.slug, **extra_fields)
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
