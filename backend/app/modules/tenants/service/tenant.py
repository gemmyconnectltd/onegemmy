import uuid

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.integrations.storage import storage
from app.modules.tenants.models import Tenant
from app.modules.tenants.repository import TenantRepository
from app.modules.tenants.schemas import TenantCreate, TenantRead, TenantUpdate

log = get_logger("tenants")


async def get_by_id(db: AsyncSession, tenant_id: uuid.UUID) -> TenantRead:
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        log.warning("tenants.get_by_id.not_found", extra={"_extra_fields": {"tenant_id": str(tenant_id)}})
        raise NotFoundError("Company not found")
    return TenantRead.model_validate(tenant)


async def get_by_slug(db: AsyncSession, slug: str) -> Tenant | None:
    return await TenantRepository(db).get_by_slug(slug)


async def create_tenant(db: AsyncSession, data: TenantCreate, *, commit: bool = True) -> TenantRead:
    from app.modules.tenants.slug import allocate_slug
    slug = await allocate_slug(db, data.slug or data.name)
    tenant = Tenant(name=data.name, slug=slug, **data.model_dump(exclude={"name", "slug"}, exclude_unset=True))
    tenant = await TenantRepository(db).save(tenant)
    await db.flush()
    from app.modules.tenants.service.branch import seed_default_branch
    from app.modules.tenants.service.department import seed_default_departments

    await seed_default_departments(db, tenant.id)
    await seed_default_branch(db, tenant.id, tenant.name)
    if commit:
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
    updates = data.model_dump(exclude_unset=True)
    if tenant.archived_at is not None and updates.get("is_active") is True:
        raise ValidationError("Archived businesses cannot be activated")
    if any(key in updates and not updates[key] for key in ("name", "slug")):
        raise ValidationError("Business name and slug cannot be empty")
    if {"subscription_plan", "subscription_status"} & updates.keys():
        from app.modules.billing.repository import BillingRepository
        if await BillingRepository(db).subscription(tenant_id) is not None:
            raise ValidationError("Manage this subscription through Plans & Billing")

    if updates.get("slug") is not None:
        from app.modules.tenants.models import TenantSlugAlias
        from app.modules.tenants.slug import allocate_slug
        updates["slug"] = await allocate_slug(db, updates["slug"], tenant_id)
        if updates["slug"] != tenant.slug and await db.get(TenantSlugAlias, tenant.slug) is None:
            db.add(TenantSlugAlias(slug=tenant.slug, tenant_id=tenant.id))
    if updates.get("currency") is not None:
        # The base currency is accounting configuration: validated against the active currency list
        # and refused once the business has recorded any money (see change_base_currency).
        from app.modules.currency.service import change_base_currency

        updates["currency"] = await change_base_currency(db, tenant_id, updates["currency"])
        await db.refresh(tenant)
    elif "currency" in updates:
        updates.pop("currency")  # explicit null must never blank the base currency
    for field, value in updates.items():
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
    # A Core-level DELETE (not session.delete(tenant)) bypasses SQLAlchemy's
    # ORM relationship management entirely, so it can't preemptively null out
    # tenant_id on loaded children before the row is removed — the database's
    # ON DELETE CASCADE (see each child model's tenant_id FK) does the actual
    # cascade, deleting users/roles/branches/departments for real instead of
    # orphaning them.
    from app.modules.billing.repository import BillingRepository
    if await BillingRepository(db).has_history(tenant_id):
        from app.core.exceptions import ValidationError
        raise ValidationError("Companies with billing history must be archived, not deleted")
    await db.execute(delete(Tenant).where(Tenant.id == tenant_id))
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


async def archive_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> TenantRead:
    """Retain financial/audit history and all identities; stop future access."""
    from datetime import UTC, datetime

    from app.modules.billing.repository import BillingRepository

    tenant = await BillingRepository(db).tenant(tenant_id, lock=True)
    if tenant is None:
        raise NotFoundError("Company not found")
    tenant.is_active = False
    tenant.archived_at = tenant.archived_at or datetime.now(UTC)
    await TenantRepository(db).save(tenant)
    return TenantRead.model_validate(tenant)
