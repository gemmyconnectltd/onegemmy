import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.modules.tenants.models import Tenant, TenantSlugAlias
from app.shared.utils import slugify


async def allocate_slug(db: AsyncSession, value: str, tenant_id: uuid.UUID | None = None) -> str:
    base = slugify(value)[:90].strip("-")
    if not base:
        raise ValidationError("Business URL must contain a letter or number")
    await db.execute(text("SELECT pg_advisory_xact_lock(18273491)"))
    candidate, suffix = base, 1
    while True:
        owner = (await db.execute(select(Tenant.id).where(Tenant.slug == candidate))).scalar_one_or_none()
        alias = (await db.execute(select(TenantSlugAlias.tenant_id).where(
            TenantSlugAlias.slug == candidate
        ))).scalar_one_or_none()
        if (owner is None or owner == tenant_id) and (alias is None or alias == tenant_id):
            return candidate
        suffix += 1
        candidate = f"{base}-{suffix}"
