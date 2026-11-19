"""Submodules and features inside modules: the platform switch, per-business restrictions and the one access check.

Layers, outermost first: the module must be usable (``resolve_modules``); then the feature, and every submodule above
it, must be switched on by Pesaa for the platform; then Pesaa must not have restricted it for this business. A feature
that fails stays readable and refuses new writes, so records are never locked away or changed.
"""
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.tenants.feature_tree import BY_KEY, chain, feature_for_path
from app.modules.tenants.models import ModuleFeature, TenantFeatureRestriction

ON, SWITCHED_OFF, RESTRICTED = "on", "switched_off", "restricted"


async def blocked_feature(db: AsyncSession, tenant_id: uuid.UUID, module: str, path: str) -> tuple[str, str] | None:
    """(why, feature name) when the feature covering ``path`` is off for this business, else None. No query at all
    for a path no feature covers, which is most of them."""
    key = feature_for_path(module, path)
    if key is None:
        return None
    keys = chain(key)
    rows = {k: (n, a) for k, n, a in (await db.execute(
        select(ModuleFeature.key, ModuleFeature.name, ModuleFeature.is_active).where(ModuleFeature.key.in_(keys))
    )).all()}
    name = rows[key][0] if key in rows else BY_KEY[key].name
    if any(k in rows and not rows[k][1] for k in keys):
        return SWITCHED_OFF, name
    restricted = (await db.execute(
        select(TenantFeatureRestriction.feature_key)
        .where(TenantFeatureRestriction.tenant_id == tenant_id, TenantFeatureRestriction.feature_key.in_(keys)).limit(1)
    )).scalar_one_or_none()
    return (RESTRICTED, name) if restricted else None


async def catalogue(db: AsyncSession) -> list[ModuleFeature]:
    return list((await db.execute(
        select(ModuleFeature).order_by(ModuleFeature.module_key, ModuleFeature.sort_order, ModuleFeature.key)
    )).scalars().all())


async def get_item(db: AsyncSession, key: str) -> ModuleFeature:
    item = (await db.execute(select(ModuleFeature).where(ModuleFeature.key == key))).scalar_one_or_none()
    if item is None:
        raise NotFoundError("Feature not found")
    return item


MODULE_OFF = "module_off"


def _status(item: ModuleFeature, modules: dict[str, str], active: dict[str, bool], restricted: set[str]) -> str:
    from app.modules.tenants.service.feature import ENABLED
    keys = chain(item.key) or [item.key]
    if modules.get(item.module_key) != ENABLED:
        return MODULE_OFF
    if not item.is_active or any(active.get(k) is False for k in keys):
        return SWITCHED_OFF
    if any(k in restricted for k in keys):
        return RESTRICTED
    return ON


async def part_states(db: AsyncSession, tenant_id: uuid.UUID, modules: dict[str, str]) -> dict[str, str]:
    """key -> on | switched_off | restricted | module_off, for the ERP's menu and read-only notices. Two small queries;
    ``modules`` is the caller's ``resolve_modules`` result so it is not worked out twice."""
    items = await catalogue(db)
    active = {i.key: i.is_active for i in items}
    restricted = set((await db.execute(
        select(TenantFeatureRestriction.feature_key).where(TenantFeatureRestriction.tenant_id == tenant_id)
    )).scalars().all())
    return {i.key: _status(i, modules, active, restricted) for i in items}


async def tenant_items(db: AsyncSession, tenant_id: uuid.UUID) -> list[dict]:
    """Every submodule and feature with its state for one business, and which layer decides it."""
    from app.modules.tenants.service.feature import resolve_modules
    modules = await resolve_modules(db, tenant_id)
    items = await catalogue(db)
    active = {i.key: i.is_active for i in items}
    restrictions = {r.feature_key: r for r in (await db.execute(
        select(TenantFeatureRestriction).where(TenantFeatureRestriction.tenant_id == tenant_id)
    )).scalars().all()}
    out = []
    for i in items:
        above = chain(i.key)[1:]
        status = _status(i, modules, active, set(restrictions))
        own = restrictions.get(i.key)
        out.append({
            "key": i.key, "module": i.module_key, "parent": i.parent_key, "level": i.level, "name": i.name,
            "description": i.description, "status": status, "module_status": modules.get(i.module_key),
            "restricted": own is not None, "restricted_by_parent": own is None and any(k in restrictions for k in above),
            "reason": own.reason if own else None,
            "restricted_at": own.created_at.isoformat() if own and own.created_at else None,
        })
    return out


async def set_restriction(db: AsyncSession, tenant_id: uuid.UUID, key: str, restricted: bool, reason: str | None,
                          actor_id: uuid.UUID | None) -> bool:
    """Restrict or restore one submodule or feature for one business. Returns whether anything changed."""
    await get_item(db, key)
    existing = (await db.execute(select(TenantFeatureRestriction).where(
        TenantFeatureRestriction.tenant_id == tenant_id, TenantFeatureRestriction.feature_key == key
    ))).scalar_one_or_none()
    if restricted:
        if existing is not None:
            return False
        if not reason or len(reason.strip()) < 3:
            raise ValidationError("Give a reason for restricting this feature")
        db.add(TenantFeatureRestriction(tenant_id=tenant_id, feature_key=key, reason=reason.strip(), created_by=actor_id))
    else:
        if existing is None:
            return False
        await db.execute(delete(TenantFeatureRestriction).where(TenantFeatureRestriction.id == existing.id))
    await db.flush()
    return True
