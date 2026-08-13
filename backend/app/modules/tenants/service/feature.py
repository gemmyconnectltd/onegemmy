import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.tenants.models import FeatureFlag, Tenant
from app.modules.tenants.repository import TenantRepository
from app.modules.tenants.schemas import (
    FeatureFlagRead,
    FeatureOverrideUpdate,
    TenantFeatureState,
    TenantLimitsRead,
    TenantLimitsUpdate,
)

LIMIT_KEYS = ["max_users", "max_branches", "max_products", "max_storage_mb"]


async def list_feature_flags(db: AsyncSession) -> list[FeatureFlagRead]:
    rows = (await db.execute(select(FeatureFlag).order_by(FeatureFlag.module, FeatureFlag.key))).scalars().all()
    return [FeatureFlagRead.model_validate(r) for r in rows]


async def _get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await TenantRepository(db).get(tenant_id)
    if tenant is None:
        raise NotFoundError("Company not found")
    return tenant


async def get_effective_features(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, bool]:
    """Catalog defaults merged with per-tenant overrides."""
    flags = (await db.execute(select(FeatureFlag).where(FeatureFlag.is_active.is_(True)))).scalars().all()
    tenant = await _get_tenant(db, tenant_id)
    overrides = tenant.features or {}
    return {f.key: bool(overrides.get(f.key, f.default_enabled)) for f in flags}


async def feature_enabled(db: AsyncSession, tenant_id: uuid.UUID, key: str) -> bool:
    if tenant_id is None:
        return True
    return (await get_effective_features(db, tenant_id)).get(key, False)


async def get_tenant_feature_state(db: AsyncSession, tenant_id: uuid.UUID) -> list[TenantFeatureState]:
    flags = (await db.execute(
        select(FeatureFlag)
        .where(FeatureFlag.is_active.is_(True))
        .order_by(FeatureFlag.module, FeatureFlag.key)
    )).scalars().all()
    tenant = await _get_tenant(db, tenant_id)
    overrides = tenant.features or {}
    return [
        TenantFeatureState(
            key=f.key,
            name=f.name,
            module=f.module,
            description=f.description,
            default_enabled=f.default_enabled,
            enabled=bool(overrides.get(f.key, f.default_enabled)),
            overridden=f.key in overrides,
        )
        for f in flags
    ]


async def set_tenant_features(
    db: AsyncSession, tenant_id: uuid.UUID, data: FeatureOverrideUpdate
) -> list[TenantFeatureState]:
    tenant = await _get_tenant(db, tenant_id)
    tenant.features = dict(data.features)
    await TenantRepository(db).save(tenant)
    await db.commit()
    return await get_tenant_feature_state(db, tenant_id)


async def reset_tenant_features(db: AsyncSession, tenant_id: uuid.UUID) -> list[TenantFeatureState]:
    tenant = await _get_tenant(db, tenant_id)
    tenant.features = {}
    await TenantRepository(db).save(tenant)
    await db.commit()
    return await get_tenant_feature_state(db, tenant_id)


async def get_tenant_limits(db: AsyncSession, tenant_id: uuid.UUID) -> TenantLimitsRead:
    tenant = await _get_tenant(db, tenant_id)
    limits = tenant.limits or {}
    return TenantLimitsRead(**{key: limits.get(key) for key in LIMIT_KEYS})


async def set_tenant_limits(
    db: AsyncSession, tenant_id: uuid.UUID, data: TenantLimitsUpdate
) -> TenantLimitsRead:
    tenant = await _get_tenant(db, tenant_id)
    merged = dict(tenant.limits or {})
    for key in LIMIT_KEYS:
        value = getattr(data, key, None)
        if value is not None and value < 0:
            value = None
        merged[key] = value
    tenant.limits = merged
    await TenantRepository(db).save(tenant)
    await db.commit()
    return await get_tenant_limits(db, tenant_id)


async def get_effective_limit(db: AsyncSession, tenant_id: uuid.UUID, key: str) -> int | None:
    if key not in LIMIT_KEYS:
        return None
    tenant = await _get_tenant(db, tenant_id)
    limits = tenant.limits or {}
    value = limits.get(key)
    return value if isinstance(value, int) and value > 0 else None


async def enforce_limit(
    db: AsyncSession, tenant_id: uuid.UUID, key: str, current_count: int, noun: str = "resource"
) -> None:
    """Raise QuotaExceededError when the tenant is at/over a configured limit."""
    from app.core.exceptions import QuotaExceededError

    limit = await get_effective_limit(db, tenant_id, key)
    if limit is not None and current_count >= limit:
        raise QuotaExceededError(
            f"{noun.capitalize()} limit reached: {limit} allowed on your plan"
        )
