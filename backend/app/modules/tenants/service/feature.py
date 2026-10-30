import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
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


# What each module genuinely needs switched on, judged by what it does with the data, not by what code it imports:
# completing production moves stock and receiving a purchase adds stock, so both need inventory; appointments and the
# walk-in queue are parts of services. Purchases only reuse accounting helpers and services only keep an optional customer link,
# so neither is forced to switch another module on.
DEPENDENCIES: dict[str, tuple[str, ...]] = {
    "manufacturing": ("inventory",),
    "procurement": ("inventory",),
    "appointments": ("services",),
    "queue": ("services",),
}

ENABLED, AVAILABLE, NOT_INCLUDED, RESTRICTED = "enabled", "available", "not_included", "restricted"


def dependents_of(key: str) -> list[str]:
    return sorted(k for k, needs in DEPENDENCIES.items() if key in needs)


async def resolve_modules(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, str]:
    """The one place a module's state for a business is decided, from three separate layers:
    the plan (entitlement), the platform's own override, and the business's own on/off choice.
    - not_included: the plan (or catalogue default, for a business with no plan) does not cover it.
    - restricted:   the plan covers it but a platform administrator has switched it off for this business.
    - available:    entitled, but the business's administrator has turned it off. History stays readable.
    - enabled:      usable, subject to each user's permissions."""
    flags = (await db.execute(select(FeatureFlag).where(FeatureFlag.is_active.is_(True)))).scalars().all()
    tenant = await _get_tenant(db, tenant_id)
    overrides = tenant.features or {}
    activation = getattr(tenant, "module_activation", None) or {}
    from app.modules.billing.repository import BillingRepository
    sub = await BillingRepository(db).subscription(tenant_id)
    included = set(sub.terms.get("modules", [])) if sub is not None else None
    enforce = settings.ENFORCE_PLAN_ENTITLEMENTS
    states: dict[str, str] = {}
    for f in flags:
        if not enforce:
            entitled, platform_off = True, overrides.get(f.key) is False  # no plan requirement: only Pesaa's restriction can close a module
        elif included is not None:
            entitled, platform_off = f.key in included, overrides.get(f.key, True) is False
        else:
            entitled, platform_off = bool(overrides.get(f.key, f.default_enabled)), False
        if not entitled:
            states[f.key] = NOT_INCLUDED
        elif platform_off:
            states[f.key] = RESTRICTED
        elif activation.get(f.key) is False:
            states[f.key] = AVAILABLE
        else:
            states[f.key] = ENABLED
    return states


async def get_effective_features(db: AsyncSession, tenant_id: uuid.UUID) -> dict[str, bool]:
    """Which modules a business can use right now."""
    return {k: v == ENABLED for k, v in (await resolve_modules(db, tenant_id)).items()}


async def module_status(db: AsyncSession, tenant_id: uuid.UUID, key: str) -> str:
    return (await resolve_modules(db, tenant_id)).get(key, NOT_INCLUDED)


async def feature_enabled(db: AsyncSession, tenant_id: uuid.UUID, key: str) -> bool:
    if tenant_id is None:
        return True
    return await module_status(db, tenant_id, key) == ENABLED


async def my_modules(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """What the business administrator sees in Features & Modules: the plan and every module with its state."""
    from app.modules.billing.models import BillingPlan
    from app.modules.billing.repository import BillingRepository
    states = await resolve_modules(db, tenant_id)
    flags = (await db.execute(select(FeatureFlag).where(FeatureFlag.is_active.is_(True))
                              .order_by(FeatureFlag.module, FeatureFlag.key))).scalars().all()
    names = {f.key: f.name for f in flags}
    sub = await BillingRepository(db).subscription(tenant_id)
    plan = await db.get(BillingPlan, sub.plan_id) if sub is not None else None

    def link(k: str) -> dict:
        return {"key": k, "name": names.get(k, k), "status": states.get(k, NOT_INCLUDED)}

    return {
        "plan": {"name": plan.name, "status": sub.status} if plan is not None and sub is not None else None,
        "modules": [{
            "key": f.key, "name": f.name, "description": f.description, "status": states[f.key],
            "needs": [link(k) for k in DEPENDENCIES.get(f.key, ())],
            "needed_by": [link(k) for k in dependents_of(f.key) if k in names],
        } for f in flags],
    }


async def set_module_activation(db: AsyncSession, tenant_id: uuid.UUID, key: str, enabled: bool) -> dict:
    """A business administrator turns an entitled module on or off. Never grants what the plan lacks; never touches data."""
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id).with_for_update())).scalar_one_or_none()
    if tenant is None:
        raise NotFoundError("Company not found")
    states = await resolve_modules(db, tenant_id)
    if key not in states:
        raise NotFoundError("Module not found")
    status = states[key]
    from app.core.exceptions import ConflictError, ForbiddenError, ValidationError
    names = {f.key: f.name for f in (await db.execute(select(FeatureFlag))).scalars().all()}
    label = names.get(key, key)
    if status == NOT_INCLUDED:
        raise ForbiddenError(f"{label} is not part of your plan. Upgrade your plan in Subscription & Billing to use it.")
    if status == RESTRICTED:
        raise ForbiddenError(f"{label} is currently restricted by Pesaa. Contact support to have it restored.")
    if enabled and status == ENABLED or not enabled and status == AVAILABLE:
        return await my_modules(db, tenant_id)
    if enabled:
        missing = [names.get(k, k) for k in DEPENDENCIES.get(key, ()) if states.get(k) != ENABLED]
        if missing:
            raise ValidationError(f"{label} needs {', '.join(missing)} turned on first.")
    else:
        blocking = [names.get(k, k) for k in dependents_of(key) if states.get(k) == ENABLED]
        if blocking:
            raise ConflictError(f"Turn off {', '.join(blocking)} first: it relies on {label}.")
    current = dict(getattr(tenant, "module_activation", None) or {})
    if enabled:
        current.pop(key, None)
    else:
        current[key] = False
    tenant.module_activation = current
    await db.flush()
    return await my_modules(db, tenant_id)


async def get_tenant_feature_state(db: AsyncSession, tenant_id: uuid.UUID) -> list[TenantFeatureState]:
    """Per module, the layers Pesaa staff need to see: plan, Pesaa's own restriction, the business's switch, and the result."""
    flags = (await db.execute(
        select(FeatureFlag)
        .where(FeatureFlag.is_active.is_(True))
        .order_by(FeatureFlag.module, FeatureFlag.key)
    )).scalars().all()
    tenant = await _get_tenant(db, tenant_id)
    overrides = tenant.features or {}
    activation = getattr(tenant, "module_activation", None) or {}
    states = await resolve_modules(db, tenant_id)
    return [
        TenantFeatureState(
            key=f.key,
            name=f.name,
            module=f.module,
            description=f.description,
            default_enabled=f.default_enabled,
            enabled=states[f.key] == ENABLED,
            overridden=f.key in overrides,
            status=states[f.key],
            included=states[f.key] != NOT_INCLUDED,
            restricted=overrides.get(f.key) is False,
            business_off=activation.get(f.key) is False,
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
    await _get_tenant(db, tenant_id)
    return TenantLimitsRead(**{key: await get_effective_limit(db, tenant_id, key) for key in LIMIT_KEYS})


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
    override = value if isinstance(value, int) and value > 0 else None
    from app.modules.billing.repository import BillingRepository
    sub = await BillingRepository(db).subscription(tenant_id)
    plan_limit = sub.terms.get(key) if sub is not None else None
    if override is not None and plan_limit is not None:
        return min(override, plan_limit)
    return plan_limit if plan_limit is not None else override


async def enforce_limit(
    db: AsyncSession, tenant_id: uuid.UUID, key: str, current_count: int, noun: str = "resource"
) -> None:
    """Raise QuotaExceededError when the tenant is at/over a configured limit."""
    from app.core.exceptions import QuotaExceededError
    from app.modules.billing.repository import BillingRepository
    repo = BillingRepository(db)
    await repo.tenant(tenant_id, lock=True)
    if key in {"max_users", "max_branches"} and await repo.subscription(tenant_id) is not None:
        usage = await repo.usage(tenant_id)
        current_count = usage["users" if key == "max_users" else "branches"]
    limit = await get_effective_limit(db, tenant_id, key)
    if limit is not None and current_count >= limit:
        raise QuotaExceededError(
            f"{noun.capitalize()} limit reached: {limit} allowed on your plan"
        )
