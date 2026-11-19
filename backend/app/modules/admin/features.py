"""Super Admin Feature Directory: the platform's feature catalogue, where each feature is sold and how far it is used.

Three different numbers are kept apart on purpose (see the Platform Usage rules in usage.py):
  - entitled: businesses whose plan (or, with no plan, the catalogue default) includes the feature
  - active:    entitled businesses that have not been switched off by Pesaa or by their own administrator
  - using:     businesses with at least one record in the module's own table (real adoption)
Features are tied to code (routers, permissions), so the catalogue can be edited and switched off but not invented here.
"""
import re
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select

from app.core.config import settings
from app.core.deps import DbSession, SuperUser
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.response import paginated_response, success_response
from app.modules.admin.usage import MODULES
from app.modules.audit.models import AuditLog
from app.modules.audit.service import record_audit
from app.modules.billing.models import BillingPlan, BillingPrice, BillingSubscription
from app.modules.tenants.models import FeatureFlag, Tenant
from app.modules.tenants.service.feature import DEPENDENCIES, dependents_of

router = APIRouter(prefix="/admin/features", tags=["Super Admin"])

Text = Annotated[str, StringConstraints(strip_whitespace=True)]
LIVE = ("active", "trialing", "past_due")


class FeaturePatch(BaseModel):
    name: Text | None = Field(None, min_length=2, max_length=150)
    description: Text | None = Field(None, max_length=255)
    default_enabled: bool | None = None
    is_active: bool | None = None
    # Switching a feature off for the whole platform needs its key typed back.
    confirm_key: str | None = None


async def _plans_by_feature(db: DbSession) -> dict[str, list[dict]]:
    rows = (await db.execute(
        select(BillingPlan, BillingPrice.terms).join(BillingPrice, (BillingPrice.plan_id == BillingPlan.id) & (BillingPrice.version == BillingPlan.version))
        .where(BillingPlan.status != "archived").order_by(BillingPlan.name)
    )).all()
    seen: dict[str, dict[uuid.UUID, dict]] = {}
    for plan, terms in rows:
        for key in terms.get("modules") or []:
            seen.setdefault(key, {})[plan.id] = {"id": str(plan.id), "name": plan.name, "status": plan.status}
    return {k: list(v.values()) for k, v in seen.items()}




class Segment(BaseModel):
    """Which businesses to count: every filter narrows the same set, so each number is about the same group."""
    industry: str | None = None
    size: str | None = None
    country: str | None = None
    business_type: str | None = None
    plan: uuid.UUID | None = None

    def conditions(self) -> list:
        out = [Tenant.archived_at.is_(None)]
        for column, value in ((Tenant.industry, self.industry), (Tenant.employee_count, self.size), (Tenant.country, self.country), (Tenant.business_type, self.business_type)):
            if value:
                out.append(column == value)
        if self.plan:
            out.append(BillingSubscription.plan_id == self.plan)
        return out

    def ids(self):
        return (select(Tenant.id).select_from(Tenant).outerjoin(BillingSubscription, BillingSubscription.tenant_id == Tenant.id).where(*self.conditions()))


async def _tenant_counts(db: DbSession, flags: list[FeatureFlag], segment: Segment | None = None) -> dict[str, dict[str, int]]:
    """entitled / active per feature, from one pass over the businesses (the same rules as resolve_modules)."""
    segment = segment or Segment()
    rows = (await db.execute(
        select(Tenant.features, Tenant.module_activation, BillingSubscription.terms, BillingSubscription.status)
        .select_from(Tenant).outerjoin(BillingSubscription, BillingSubscription.tenant_id == Tenant.id)
        .where(*segment.conditions())
    )).all()
    out = {f.key: {"entitled": 0, "active": 0} for f in flags}
    for overrides, activation, terms, sub_status in rows:
        overrides, activation = overrides or {}, activation or {}
        for f in flags:
            if not settings.ENFORCE_PLAN_ENTITLEMENTS:
                entitled, platform_off = True, overrides.get(f.key) is False
            elif terms is not None:
                if sub_status not in LIVE:
                    continue
                entitled, platform_off = f.key in (terms.get("modules") or []), overrides.get(f.key, True) is False
            else:
                entitled, platform_off = bool(overrides.get(f.key, f.default_enabled)), False
            if not entitled:
                continue
            out[f.key]["entitled"] += 1
            if not platform_off and activation.get(f.key) is not False:
                out[f.key]["active"] += 1
    return out


async def _using(db: DbSession, key: str, segment: Segment | None = None) -> int | None:
    segment = segment or Segment()
    if key not in MODULES:
        return None
    model = MODULES[key][1]
    return (await db.execute(select(func.count(func.distinct(model.tenant_id))).select_from(model).where(model.tenant_id.in_(segment.ids())))).scalar_one()


async def _options(db: DbSession) -> dict:
    """The values a business can be filtered by, with how many businesses have each, so the filter menus only offer real choices."""
    def counted(column):
        return select(column, func.count(Tenant.id)).where(Tenant.archived_at.is_(None), column.is_not(None), column != "").group_by(column).order_by(func.count(Tenant.id).desc(), column)
    async def values(column):
        return [{"value": v, "count": int(c)} for v, c in (await db.execute(counted(column))).all()]
    sizes = await values(Tenant.employee_count)
    def smallest(label: str) -> int:
        found = re.search(r"\d+", label)
        return int(found.group()) if found else (1 if label.lower().startswith("just") else 10**9)
    sizes.sort(key=lambda r: (smallest(r["value"]), r["value"]))
    plans = (await db.execute(select(BillingPlan.id, BillingPlan.name, func.count(Tenant.id)).select_from(BillingPlan)
                              .join(BillingSubscription, BillingSubscription.plan_id == BillingPlan.id).join(Tenant, Tenant.id == BillingSubscription.tenant_id)
                              .where(Tenant.archived_at.is_(None)).group_by(BillingPlan.id, BillingPlan.name).order_by(BillingPlan.name))).all()
    return {"industries": await values(Tenant.industry), "sizes": sizes, "countries": await values(Tenant.country),
            "business_types": await values(Tenant.business_type), "plans": [{"value": str(i), "label": n, "count": int(c)} for i, n, c in plans]}


async def _link_names(db: DbSession) -> dict[str, str]:
    return {f.key: f.name for f in (await db.execute(select(FeatureFlag))).scalars().all()}


def _row(f: FeatureFlag, names: dict[str, str], plans: dict[str, list[dict]], counts: dict[str, dict[str, int]]) -> dict:
    return {
        "key": f.key, "name": f.name, "module": f.module, "description": f.description,
        "default_enabled": f.default_enabled, "is_active": f.is_active,
        "needs": [{"key": k, "name": names.get(k, k)} for k in DEPENDENCIES.get(f.key, ())],
        "needed_by": [{"key": k, "name": names.get(k, k)} for k in dependents_of(f.key)],
        "plans": plans.get(f.key, []), **{f"{k}_tenants": v for k, v in counts.get(f.key, {"entitled": 0, "active": 0}).items()},
    }


@router.get("/directory")
async def feature_directory(db: DbSession, _: SuperUser, industry: Annotated[str | None, Query(max_length=100)] = None, size: Annotated[str | None, Query(max_length=20)] = None,
                            country: Annotated[str | None, Query(max_length=100)] = None, business_type: Annotated[str | None, Query(max_length=50)] = None, plan: uuid.UUID | None = None):
    segment = Segment(industry=industry, size=size, country=country, business_type=business_type, plan=plan)
    flags = (await db.execute(select(FeatureFlag).order_by(FeatureFlag.module, FeatureFlag.key))).scalars().all()
    names, plans, counts = {f.key: f.name for f in flags}, await _plans_by_feature(db), await _tenant_counts(db, list(flags), segment)
    items = []
    for f in flags:
        items.append({**_row(f, names, plans, counts), "using_tenants": await _using(db, f.key, segment)})
    total = (await db.execute(select(func.count()).select_from(segment.ids().subquery()))).scalar_one()
    everyone = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.archived_at.is_(None)))).scalar_one()
    return success_response(data={"features": items, "total_tenants": total, "all_tenants": everyone, "options": await _options(db),
                                  "segment": segment.model_dump(mode="json", exclude_none=True)}, message="Feature directory retrieved")


async def _flag(db: DbSession, key: str) -> FeatureFlag:
    flag = (await db.execute(select(FeatureFlag).where(FeatureFlag.key == key))).scalar_one_or_none()
    if flag is None:
        raise NotFoundError("Feature not found")
    return flag


@router.get("/{key}/detail")
async def feature_detail(key: str, db: DbSession, _: SuperUser):
    flag = await _flag(db, key)
    names, plans, counts = await _link_names(db), await _plans_by_feature(db), await _tenant_counts(db, [flag])
    history = (await db.execute(
        select(AuditLog).where(AuditLog.entity_type == "feature", AuditLog.entity_id == key).order_by(AuditLog.created_at.desc()).limit(50)
    )).scalars().all()
    off_by_platform = (await db.execute(
        select(func.count()).select_from(Tenant).where(Tenant.archived_at.is_(None), Tenant.features[key].astext == "false")
    )).scalar_one()
    off_by_tenant = (await db.execute(
        select(func.count()).select_from(Tenant).where(Tenant.archived_at.is_(None), Tenant.module_activation[key].astext == "false")
    )).scalar_one()
    return success_response(data={
        **_row(flag, names, plans, counts), "using_tenants": await _using(db, key),
        "overridden_off_tenants": off_by_platform, "deactivated_by_tenant": off_by_tenant,
        "history": [{"id": str(h.id), "action": h.action, "summary": h.summary, "actor": h.actor_name, "changes": h.changes,
                     "at": h.created_at.isoformat() if h.created_at else None} for h in history],
    }, message="Feature retrieved")


@router.patch("/{key}")
async def update_feature(key: str, data: FeaturePatch, db: DbSession, admin: SuperUser):
    """Edit a catalogue entry. The key never changes and nothing a business has recorded is touched."""
    flag = await _flag(db, key)
    sent = data.model_fields_set - {"confirm_key"}
    if not sent:
        raise ValidationError("Nothing to change")
    if "is_active" in sent and data.is_active is False and flag.is_active:
        if data.confirm_key != key:
            raise ValidationError(f"Type the feature key ({key}) to switch it off for the whole platform")
        needing = [k for k in dependents_of(key) if (await _flag_active(db, k))]
        if needing:
            raise ConflictError(f"Switch off {', '.join(needing)} first: it relies on this feature")
    before = {k: getattr(flag, k) for k in sent}
    for field in sent:
        value = getattr(data, field)
        if value is None and field != "description":
            raise ValidationError(f"{field.replace('_', ' ').capitalize()} cannot be empty")
        setattr(flag, field, value)
    await db.flush()
    action = "feature.deactivate" if "is_active" in sent and not flag.is_active else "feature.activate" if "is_active" in sent else "feature.update"
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email, action=action,
        entity_type="feature", entity_id=key, summary=f"Feature {key} updated",
        changes={"before": before, "after": {k: getattr(flag, k) for k in sent}},
    )
    await db.commit()
    return success_response(data=None, message="Feature updated")


async def _flag_active(db: DbSession, key: str) -> bool:
    row = (await db.execute(select(FeatureFlag.is_active).where(FeatureFlag.key == key))).scalar_one_or_none()
    return bool(row)


# ── Submodules and features inside modules ──────────────────────────────────────────────────────────────────────────


class FeatureItemPatch(BaseModel):
    name: Text | None = Field(None, min_length=2, max_length=150)
    description: Text | None = Field(None, max_length=255)
    is_active: bool | None = None
    confirm_key: str | None = None  # switching off for the whole platform needs the key typed back
    reason: Text | None = Field(None, max_length=255)  # required when switching on or off


class TenantItemChange(BaseModel):
    restricted: bool
    reason: Text | None = Field(None, max_length=255)


@router.get("/tree")
async def feature_tree(db: DbSession, _: SuperUser):
    """Every module with its submodules and features nested under it, and how many businesses each one is restricted for."""
    from app.modules.tenants.feature_tree import BY_KEY
    from app.modules.tenants.models import ModuleFeature, TenantFeatureRestriction
    from app.modules.tenants.service.feature_items import catalogue
    modules = (await db.execute(select(FeatureFlag).order_by(FeatureFlag.module, FeatureFlag.key))).scalars().all()
    items = await catalogue(db)
    restricted = dict((await db.execute(
        select(TenantFeatureRestriction.feature_key, func.count()).join(Tenant, Tenant.id == TenantFeatureRestriction.tenant_id)
        .where(Tenant.archived_at.is_(None)).group_by(TenantFeatureRestriction.feature_key)
    )).all())

    def node(i: ModuleFeature) -> dict:
        code = BY_KEY.get(i.key)
        return {"key": i.key, "name": i.name, "description": i.description, "level": i.level, "is_active": i.is_active,
                "restricted_tenants": int(restricted.get(i.key, 0)), "routes": list(code.paths) if code else [],
                "children": [node(c) for c in items if c.parent_key == i.key]}

    return success_response(data=[{
        "key": m.key, "name": m.name, "description": m.description, "is_active": m.is_active,
        "children": [node(i) for i in items if i.module_key == m.key and i.parent_key is None],
    } for m in modules], message="Feature tree retrieved")


CHANGE_ACTIONS = ("tenant.features.update", "tenant.features.reset")


@router.get("/changes")
async def feature_changes(db: DbSession, _: SuperUser, page: Annotated[int, Query(ge=1)] = 1,
                          page_size: Annotated[int, Query(ge=1, le=100)] = 25,
                          scope: Literal["all", "platform", "business"] = "all"):
    """Every change to modules, submodules and features in one list: platform switches and per-business restrictions."""
    from sqlalchemy import or_
    conditions = [or_(AuditLog.entity_type == "feature", AuditLog.action.in_(CHANGE_ACTIONS))]
    if scope == "platform":
        conditions.append(AuditLog.tenant_id.is_(None))
    elif scope == "business":
        conditions.append(AuditLog.tenant_id.is_not(None))
    total = (await db.execute(select(func.count()).select_from(AuditLog).where(*conditions))).scalar_one()
    rows = (await db.execute(
        select(AuditLog, Tenant.name).outerjoin(Tenant, Tenant.id == AuditLog.tenant_id).where(*conditions)
        .order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )).all()
    items = [{"id": str(h.id), "action": h.action, "summary": h.summary, "actor": h.actor_name, "target": h.entity_id,
              "tenant_id": str(h.tenant_id) if h.tenant_id else None, "tenant_name": name, "changes": h.changes,
              "at": h.created_at.isoformat() if h.created_at else None} for h, name in rows]
    return paginated_response(items, total, page, page_size, message="Feature changes retrieved")


@router.get("/items/{key}/history")
async def feature_item_history(key: str, db: DbSession, _: SuperUser):
    from app.modules.tenants.service.feature_items import get_item
    await get_item(db, key)
    rows = (await db.execute(
        select(AuditLog).where(AuditLog.entity_type == "feature", AuditLog.entity_id == key).order_by(AuditLog.created_at.desc()).limit(50)
    )).scalars().all()
    return success_response(data=[{"id": str(h.id), "action": h.action, "summary": h.summary, "actor": h.actor_name, "changes": h.changes,
                                   "at": h.created_at.isoformat() if h.created_at else None} for h in rows], message="History retrieved")


@router.patch("/items/{key}")
async def update_feature_item(key: str, data: FeatureItemPatch, db: DbSession, admin: SuperUser):
    """Rename, describe, or switch a submodule or feature on or off for every business. Records are never touched:
    a switched-off feature stays readable and refuses new writes."""
    from app.modules.tenants.service.feature_items import get_item
    item = await get_item(db, key)
    sent = data.model_fields_set - {"confirm_key", "reason"}
    if not sent:
        raise ValidationError("Nothing to change")
    switching = "is_active" in sent and data.is_active is not None and data.is_active != item.is_active
    if "is_active" in sent and data.is_active is None:
        raise ValidationError("Is active cannot be empty")
    if switching:
        if not data.reason or len(data.reason) < 3:
            raise ValidationError("Give a reason: it is saved in the audit log")
        if data.is_active is False and data.confirm_key != key:
            raise ValidationError(f"Type the feature key ({key}) to switch it off for the whole platform")
    before = {k: getattr(item, k) for k in sent}
    for field in sent:
        value = getattr(data, field)
        if field == "name" and not value:
            raise ValidationError("Name cannot be empty")
        setattr(item, field, value)
    await db.flush()
    action = ("feature.deactivate" if not item.is_active else "feature.activate") if switching else "feature.update"
    label = "switched off for every business" if action == "feature.deactivate" else "switched back on" if action == "feature.activate" else "updated"
    await record_audit(
        db, tenant_id=None, actor_user_id=admin.id, actor_name=admin.full_name or admin.email, action=action,
        entity_type="feature", entity_id=key, summary=f"{item.name} {label}" + (f": {data.reason}" if switching else ""),
        changes={"before": before, "after": {k: getattr(item, k) for k in sent}, "reason": data.reason},
    )
    await db.commit()
    return success_response(data=None, message="Feature updated")


@router.get("/tenants/{tenant_id}/items")
async def tenant_feature_items(tenant_id: uuid.UUID, db: DbSession, _: SuperUser):
    from app.modules.tenants.service.feature_items import tenant_items
    return success_response(data=await tenant_items(db, tenant_id), message="Business features retrieved")


@router.put("/tenants/{tenant_id}/items/{key}")
async def set_tenant_feature_item(tenant_id: uuid.UUID, key: str, data: TenantItemChange, db: DbSession, admin: SuperUser):
    """Restrict or restore one submodule or feature for one business. Restricting a submodule covers every feature in it."""
    from app.modules.tenants.service.feature_items import get_item, set_restriction, tenant_items
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFoundError("Company not found")
    item = await get_item(db, key)
    changed = await set_restriction(db, tenant_id, key, data.restricted, data.reason, admin.id)
    if changed:
        await record_audit(
            db, tenant_id=tenant_id, actor_user_id=admin.id, actor_name=admin.full_name or admin.email,
            action="tenant.feature_item.restrict" if data.restricted else "tenant.feature_item.restore",
            entity_type="feature", entity_id=key,
            summary=f"{item.name} {'restricted' if data.restricted else 'restored'} for {tenant.name}" + (f": {data.reason}" if data.restricted else ""),
            changes={"restricted": data.restricted, "reason": data.reason},
        )
    await db.commit()
    return success_response(data=await tenant_items(db, tenant_id), message="Business feature updated")
