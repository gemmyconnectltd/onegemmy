import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging import get_logger
from app.integrations.storage import storage
from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository
from app.modules.tenants.schemas import TenantCreate, TenantRead, TenantUpdate
from app.shared.utils import slugify, unique_slug

log = get_logger("tenants")


async def get_by_id(db: AsyncSession, tenant_id: uuid.UUID) -> TenantRead:
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        log.warning("tenants.get_by_id.not_found", extra={"_extra_fields": {"tenant_id": str(tenant_id)}})
        raise NotFoundError("Company not found")
    return TenantRead.model_validate(tenant)


async def get_by_slug(db: AsyncSession, slug: str) -> Tenant | None:
    return await TenantRepository(db).get_by_slug(slug)


async def create_tenant(db: AsyncSession, data: TenantCreate) -> TenantRead:
    async def _slug_exists(s: str) -> bool:
        return await get_by_slug(db, s) is not None
    if data.slug:
        slug = f"TEN-{slugify(data.slug)}".upper()
        if await _slug_exists(slug):
            raise ConflictError("Company with this slug already exists")
    else:
        slug = await unique_slug("TEN", _slug_exists)
    log.info("tenants.create_tenant.attempt", extra={"_extra_fields": {"name": data.name, "slug": slug}})

    tenant = Tenant(name=data.name, slug=slug, **data.model_dump(exclude={"name", "slug"}, exclude_unset=True))
    tenant = await TenantRepository(db).save(tenant)
    await db.commit()
    from app.modules.tenants.service.department import seed_default_departments

    await seed_default_departments(db, tenant.id)
    await db.commit()
    log.info("tenants.create_tenant.success", extra={"_extra_fields": {"tenant_id": str(tenant.id)}})
    return TenantRead.model_validate(tenant)


async def list_all(db: AsyncSession, offset: int = 0, limit: int = 20) -> list[TenantRead]:
    tenants = await TenantRepository(db).list_all(offset, limit)
    return [TenantRead.model_validate(t) for t in tenants]


async def count_all(db: AsyncSession) -> int:
    return await TenantRepository(db).count_all()


async def update_tenant(db: AsyncSession, tenant_id: uuid.UUID, data: TenantUpdate) -> TenantRead:
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        raise NotFoundError("Company not found")
    fields = list(data.model_dump(exclude_unset=True).keys())
    log.info("tenants.update.attempt", extra={"_extra_fields": {"tenant_id": str(tenant_id), "fields": fields}})
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    tenant = await TenantRepository(db).save(tenant)
    await db.commit()
    log.info("tenants.update.success", extra={"_extra_fields": {"tenant_id": str(tenant_id)}})
    return TenantRead.model_validate(tenant)


async def delete_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        raise NotFoundError("Company not found")
    log.info("tenants.delete.attempt", extra={"_extra_fields": {"tenant_id": str(tenant_id), "name": tenant.name}})
    await TenantRepository(db).delete(tenant)
    await db.commit()
    log.info("tenants.delete.success", extra={"_extra_fields": {"tenant_id": str(tenant_id)}})


async def upload_logo(db: AsyncSession, tenant_id: uuid.UUID, filename: str, content: bytes) -> str:
    url = await storage.save("logos", filename, content)
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        raise NotFoundError("Company not found")
    tenant.logo_url = url
    await TenantRepository(db).save(tenant)
    await db.commit()
    return url
