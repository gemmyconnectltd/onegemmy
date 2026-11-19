"""Super Admin Feature Directory: the platform's feature catalogue, where each feature is sold and how far it is used.

Three different numbers are kept apart on purpose (see the Platform Usage rules in usage.py):
  - entitled: businesses whose plan (or, with no plan, the catalogue default) includes the feature
  - active:    entitled businesses that have not been switched off by Pesaa or by their own administrator
  - using:     businesses with at least one record in the module's own table (real adoption)
Features are tied to code (routers, permissions), so the catalogue can be edited and switched off but not invented here.
"""
import re
import uuid
from datetime import datetime
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


# ── Full control over every module and part ───────────────────────────────────────────────────────────────────────
# Status & messages, schedule, rollout & beta cohort, kill switch, actions & roles, settings & limits, plans per part,
# per-business exceptions, impact, usage, bulk changes and access by business or user. Every change needs a reason
# (cohort edits excepted) and is audited; the rules themselves live in tenants.service.feature_control.

STATUS = Literal["active", "inactive", "coming_soon", "beta", "maintenance", "deprecated"]
ACTION = Literal["create", "edit", "delete", "approve", "import", "export"]
DISRUPTIVE = ("inactive", "coming_soon")


class RolesRule(BaseModel):
    roles: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]] = Field(..., min_length=1, max_length=20)


Rule = Literal["everyone", "admins", "off"] | RolesRule


class StatusChange(BaseModel):
    status: STATUS
    message: Text | None = Field(None, max_length=500)
    when: Literal["now", "schedule"] = "now"
    at: datetime | None = None  # with when="schedule"; stored in UTC
    reason: Text = Field(..., min_length=3, max_length=255)
    confirm_key: str | None = None


class RolloutChange(BaseModel):
    rollout_percent: int = Field(..., ge=0, le=100)
    reason: Text = Field(..., min_length=3, max_length=255)


class KillChange(BaseModel):
    on: bool
    reason: Text = Field(..., min_length=3, max_length=255)
    confirm_key: str | None = None


class ActionsChange(BaseModel):
    actions: dict[ACTION, Rule]
    reason: Text = Field(..., min_length=3, max_length=255)


class SettingsChange(BaseModel):
    """Values for feature_control.settings_for(key); None or "" clears one. plans: plan ids that include a part
    (empty = every plan that has the module). plan_daily_limits: {plan_id: n}."""
    settings: dict[str, int | float | str | None] = Field(default_factory=dict)
    plans: list[uuid.UUID] | None = None
    plan_daily_limits: dict[uuid.UUID, int | None] | None = None
    reason: Text = Field(..., min_length=3, max_length=255)


class OverrideChange(BaseModel):
    status: STATUS | None = None
    message: Text | None = Field(None, max_length=500)
    actions: dict[ACTION, Rule] = Field(default_factory=dict)
    settings: dict[str, int | float | str | None] = Field(default_factory=dict)
    reason: Text = Field(..., min_length=3, max_length=255)


class CohortAdd(BaseModel):
    target_type: Literal["tenant", "branch", "user"]
    target_id: uuid.UUID


class Reason(BaseModel):
    reason: Text = Field(..., min_length=3, max_length=255)


class BulkChange(BaseModel):
    keys: list[Annotated[str, StringConstraints(min_length=2, max_length=120)]] = Field(..., min_length=1, max_length=200)
    op: Literal["status", "kill", "unkill", "actions", "rollout"]
    status: STATUS | None = None
    message: Text | None = Field(None, max_length=500)
    actions: dict[ACTION, Rule] | None = None
    rollout_percent: int | None = Field(None, ge=0, le=100)
    reason: Text = Field(..., min_length=3, max_length=255)
    confirm: str | None = None  # "APPLY <n>" for changes that stop businesses working


def _rule(value) -> object:
    return value.model_dump() if isinstance(value, RolesRule) else value


async def _control_target(db: DbSession, key: str) -> dict:
    """What the key is: a module, submodule or feature, with its name and place."""
    from app.modules.tenants.models import ModuleFeature
    flag = (await db.execute(select(FeatureFlag).where(FeatureFlag.key == key))).scalar_one_or_none()
    if flag is not None:
        return {"key": key, "name": flag.name, "description": flag.description, "level": "module", "module": key,
                "parent": None, "catalogue_on": flag.is_active}
    item = (await db.execute(select(ModuleFeature).where(ModuleFeature.key == key))).scalar_one_or_none()
    if item is None:
        raise NotFoundError(f"Feature not found: {key}")
    return {"key": key, "name": item.name, "description": item.description, "level": item.level, "module": item.module_key,
            "parent": item.parent_key, "catalogue_on": item.is_active}


async def _control_row(db: DbSession, key: str, actor: uuid.UUID):
    from app.modules.tenants.models import FeatureControl
    row = (await db.execute(select(FeatureControl).where(FeatureControl.key == key).with_for_update())).scalar_one_or_none()
    if row is None:
        row = FeatureControl(key=key, status="active", rollout_percent=100, kill_switch=False, actions={}, settings={})
        db.add(row)
        await db.flush()
    row.updated_by = actor
    return row


async def _sync_catalogue(db: DbSession, target: dict, status: str) -> None:
    """Keep the old on/off switch in step. A part's switch follows its status; a module's is only switched back on,
    because switching a module's catalogue entry off hides it from plans (Inactive is handled by the controls)."""
    from app.modules.tenants.models import ModuleFeature
    if target["level"] == "module":
        if status != "inactive" and not target["catalogue_on"]:
            (await db.execute(select(FeatureFlag).where(FeatureFlag.key == target["key"]))).scalar_one().is_active = True
    else:
        (await db.execute(select(ModuleFeature).where(ModuleFeature.key == target["key"]))).scalar_one().is_active = status != "inactive"


def _snapshot(row) -> dict:
    return {"status": row.status, "message": row.message, "scheduled_status": row.scheduled_status,
            "scheduled_at": row.scheduled_at.isoformat() if row.scheduled_at else None, "rollout_percent": row.rollout_percent,
            "kill_switch": row.kill_switch, "actions": dict(row.actions or {}), "settings": dict(row.settings or {})}


async def _audit(db: DbSession, admin, key: str, action: str, summary: str, before: dict | None, after: dict | None,
                 reason: str | None, tenant_id: uuid.UUID | None = None):
    await record_audit(db, tenant_id=tenant_id, actor_user_id=admin.id if admin else None,
                       actor_name=(admin.full_name or admin.email) if admin else "Schedule", action=action,
                       entity_type="feature", entity_id=key, summary=summary + (f": {reason}" if reason else ""),
                       changes={"before": before, "after": after, "reason": reason})


async def _apply_due_schedule(db: DbSession, key: str) -> bool:
    """Save a scheduled status whose time has come (the rules already obey it; this records it)."""
    from datetime import UTC
    from app.modules.tenants.models import FeatureControl
    row = (await db.execute(select(FeatureControl).where(FeatureControl.key == key).with_for_update())).scalar_one_or_none()
    if row is None or not row.scheduled_status or not row.scheduled_at or row.scheduled_at > datetime.now(UTC):
        return False
    before = _snapshot(row)
    row.status, row.message = row.scheduled_status, row.scheduled_message
    row.scheduled_status = row.scheduled_message = row.scheduled_at = None
    await _sync_catalogue(db, await _control_target(db, key), row.status)
    await _audit(db, None, key, "feature.status", f"Scheduled status {row.status} applied", before, _snapshot(row), "scheduled")
    await db.commit()
    return True


# Each change as a function, so single and bulk changes run exactly the same code. None of them commits.

async def _do_status(db: DbSession, admin, key: str, data: StatusChange) -> None:
    from datetime import UTC
    target = await _control_target(db, key)
    row = await _control_row(db, key, admin.id)
    before = _snapshot(row)
    message = data.message or None
    if data.when == "schedule":
        if data.at is None:
            raise ValidationError("Pick the date and time for the change")
        at = data.at if data.at.tzinfo else data.at.replace(tzinfo=UTC)
        if at <= datetime.now(UTC):
            raise ValidationError("The scheduled time must be in the future")
        row.scheduled_status, row.scheduled_message, row.scheduled_at = data.status, message, at
        summary = f"{target['name']}: status {data.status} scheduled for {at.strftime('%d %b %Y %H:%M')} UTC"
    else:
        row.status, row.message = data.status, message
        row.scheduled_status = row.scheduled_message = row.scheduled_at = None
        await _sync_catalogue(db, target, data.status)
        summary = f"{target['name']}: status set to {data.status}"
    await db.flush()
    await _audit(db, admin, key, "feature.status", summary, before, _snapshot(row), data.reason)


async def _do_kill(db: DbSession, admin, key: str, on: bool, reason: str) -> None:
    target = await _control_target(db, key)
    row = await _control_row(db, key, admin.id)
    before = _snapshot(row)
    row.kill_switch, row.kill_reason = on, reason if on else None
    await db.flush()
    await _audit(db, admin, key, "feature.kill" if on else "feature.unkill", f"{target['name']}: kill switch {'on' if on else 'off'}",
                 before, _snapshot(row), reason)


async def _do_actions(db: DbSession, admin, key: str, actions: dict, reason: str) -> None:
    target = await _control_target(db, key)
    row = await _control_row(db, key, admin.id)
    before = _snapshot(row)
    merged = {**(row.actions or {}), **{a: _rule(r) for a, r in actions.items()}}
    row.actions = {a: r for a, r in merged.items() if r != "everyone"}
    await db.flush()
    await _audit(db, admin, key, "feature.actions", f"{target['name']}: actions updated", before, _snapshot(row), reason)


async def _do_rollout(db: DbSession, admin, key: str, percent: int, reason: str) -> None:
    target = await _control_target(db, key)
    row = await _control_row(db, key, admin.id)
    before = _snapshot(row)
    row.rollout_percent = percent
    await db.flush()
    await _audit(db, admin, key, "feature.rollout", f"{target['name']}: rollout set to {percent}%", before, _snapshot(row), reason)


def _clean_settings(key: str, values: dict) -> dict:
    """Only known settings, with their values checked."""
    from app.modules.tenants.service.feature_control import parse_hours, settings_for
    from zoneinfo import ZoneInfo
    defs = {d.name: d for d in settings_for(key)}
    out = {}
    for name, value in values.items():
        if name not in defs:
            raise ValidationError(f"Unknown setting: {name}")
        d = defs[name]
        if value in (None, ""):
            out[name] = None
            continue
        if d.kind == "int":
            if not isinstance(value, (int, float)) or int(value) != value or value < 0:
                raise ValidationError(f"{d.label}: a whole number of 0 or more")
            value = int(value)
        elif d.kind == "number":
            if not isinstance(value, (int, float)) or value < 0:
                raise ValidationError(f"{d.label}: a number of 0 or more")
        elif d.kind == "hours":
            if not isinstance(value, str) or parse_hours(value) is None:
                raise ValidationError(f"{d.label}: use HH:MM-HH:MM, e.g. 07:00-20:00")
        elif name == "timezone":
            try:
                ZoneInfo(str(value))
            except Exception as exc:  # noqa: BLE001 — any lookup failure means the name is unknown
                raise ValidationError(f"Unknown time zone: {value}") from exc
        out[name] = value
    return out


async def _impact(db: DbSession, key: str, target: dict | None = None) -> dict:
    """Who a change to this feature reaches: businesses whose plan has the module, those using it lately, the cohort,
    businesses with their own exception, and what depends on it."""
    from datetime import UTC, timedelta
    from app.modules.tenants.feature_tree import part_dependents
    from app.modules.tenants.models import FeatureActivity, FeatureCohortMember, FeatureTenantOverride, ModuleFeature
    target = target or await _control_target(db, key)
    flag = (await db.execute(select(FeatureFlag).where(FeatureFlag.key == target["module"]))).scalar_one_or_none()
    counts = (await _tenant_counts(db, [flag])).get(flag.key, {"entitled": 0, "active": 0}) if flag else {"entitled": 0, "active": 0}
    under = [key]
    if target["level"] != "feature":
        column = ModuleFeature.module_key if target["level"] == "module" else ModuleFeature.parent_key
        under += list((await db.execute(select(ModuleFeature.key).where(column == key))).scalars().all())
    since = datetime.now(UTC).date() - timedelta(days=30)
    active = (await db.execute(select(func.count(func.distinct(FeatureActivity.tenant_id)))
                               .where(FeatureActivity.feature_key.in_(under), FeatureActivity.day >= since))).scalar_one()
    names = await _link_names(db)
    dependents = part_dependents(key) if target["level"] != "module" else dependents_of(key)
    return {
        "entitled": counts["entitled"], "switched_on": counts["active"], "active_30d": int(active),
        "records_in_module": await _using(db, target["module"]) if target["level"] == "module" else None,
        "cohort": (await db.execute(select(func.count()).select_from(FeatureCohortMember).where(FeatureCohortMember.feature_key == key))).scalar_one(),
        "exceptions": (await db.execute(select(func.count()).select_from(FeatureTenantOverride).where(FeatureTenantOverride.feature_key == key))).scalar_one(),
        "dependents": [{"key": k, "name": names.get(k, k)} for k in dependents],
        "parts_inside": len(under) - 1,
    }


async def _usage(db: DbSession, key: str) -> dict:
    """Accepted changes in the last 30 days, by action and by business (top 5)."""
    from datetime import UTC, timedelta
    from app.modules.tenants.models import FeatureActivity
    since = datetime.now(UTC).date() - timedelta(days=30)
    by_action = dict((await db.execute(select(FeatureActivity.action, func.sum(FeatureActivity.count))
                                       .where(FeatureActivity.feature_key == key, FeatureActivity.day >= since).group_by(FeatureActivity.action))).all())
    top = (await db.execute(select(Tenant.id, Tenant.name, func.sum(FeatureActivity.count).label("n")).join(Tenant, Tenant.id == FeatureActivity.tenant_id)
                            .where(FeatureActivity.feature_key == key, FeatureActivity.day >= since)
                            .group_by(Tenant.id, Tenant.name).order_by(func.sum(FeatureActivity.count).desc()).limit(5))).all()
    days = dict((await db.execute(select(FeatureActivity.day, func.sum(FeatureActivity.count)).where(
        FeatureActivity.feature_key == key, FeatureActivity.day >= datetime.now(UTC).date() - timedelta(days=13)).group_by(FeatureActivity.day))).all())
    today = datetime.now(UTC).date()
    return {"by_action": {a: int(n) for a, n in by_action.items()},
            "top_businesses": [{"id": str(i), "name": n, "changes": int(c)} for i, n, c in top],
            "last_14_days": [{"day": (today - timedelta(days=d)).isoformat(), "changes": int(days.get(today - timedelta(days=d), 0))} for d in range(13, -1, -1)]}


@router.get("/control/{key}")
async def get_feature_control(key: str, db: DbSession, _: SuperUser):
    """Everything Pesaa controls for one module or part, with exceptions, cohort, impact, usage and history."""
    from dataclasses import asdict
    from app.modules.tenants.feature_tree import PART_DEPENDENCIES
    from app.modules.tenants.models import FeatureCohortMember, FeatureControl, FeatureTenantOverride, ModuleFeature
    from app.modules.tenants.service.feature_control import ACTIONS, DEFAULT_MESSAGES, STATUSES, settings_for, to_control
    await _apply_due_schedule(db, key)
    target = await _control_target(db, key)
    row = (await db.execute(select(FeatureControl).where(FeatureControl.key == key))).scalar_one_or_none()
    c = to_control(key, target["name"], row, target["catalogue_on"])
    members = (await db.execute(
        select(FeatureCohortMember, Tenant.name).join(Tenant, Tenant.id == FeatureCohortMember.tenant_id)
        .where(FeatureCohortMember.feature_key == key).order_by(FeatureCohortMember.created_at.desc())
    )).all()
    overrides = (await db.execute(
        select(FeatureTenantOverride, Tenant.name).join(Tenant, Tenant.id == FeatureTenantOverride.tenant_id)
        .where(FeatureTenantOverride.feature_key == key).order_by(Tenant.name)
    )).all()
    history = (await db.execute(
        select(AuditLog).where(AuditLog.entity_type == "feature", AuditLog.entity_id == key).order_by(AuditLog.created_at.desc()).limit(50)
    )).scalars().all()
    children = []
    if target["level"] != "feature":
        column = ModuleFeature.module_key if target["level"] == "module" else ModuleFeature.parent_key
        extra = (ModuleFeature.parent_key.is_(None),) if target["level"] == "module" else ()
        children = [{"key": k, "name": n, "level": lvl} for k, n, lvl in (await db.execute(
            select(ModuleFeature.key, ModuleFeature.name, ModuleFeature.level).where(column == key, *extra).order_by(ModuleFeature.sort_order)
        )).all()]
    plans = (await db.execute(select(BillingPlan.id, BillingPlan.name, BillingPlan.status).where(BillingPlan.status != "archived").order_by(BillingPlan.name))).all()
    sold_in = {p["id"] for p in (await _plans_by_feature(db)).get(target["module"], [])}
    names = await _link_names(db)
    settings = dict(row.settings or {}) if row else {}
    return success_response(data={
        **target, "children": children,
        "status": c.status, "message": c.message, "scheduled_status": c.scheduled_status, "scheduled_message": c.scheduled_message,
        "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None, "rollout_percent": c.rollout_percent,
        "kill_switch": c.kill_switch, "kill_reason": row.kill_reason if row else None,
        "actions": {a: c.actions.get(a, "everyone") for a in ACTIONS},
        "statuses": list(STATUSES), "default_messages": {s: (DEFAULT_MESSAGES.get(s) or "").format(name=target["name"]) for s in STATUSES},
        "settings": {k: v for k, v in settings.items() if k not in ("plans", "plan_daily_limits")},
        "setting_defs": [asdict(d) for d in settings_for(key)],
        "plans": [{"id": str(i), "name": n, "status": st, "has_module": str(i) in sold_in} for i, n, st in plans],
        "included_plans": [str(p) for p in settings.get("plans") or []],
        "plan_daily_limits": settings.get("plan_daily_limits") or {},
        "needs": [{"key": k, "name": names.get(k, k)} for k in (PART_DEPENDENCIES.get(key, ()) if target["level"] != "module" else DEPENDENCIES.get(key, ()))],
        "impact": await _impact(db, key, target), "usage": await _usage(db, key),
        "cohort": [{"id": str(m.id), "target_type": m.target_type, "target_id": str(m.target_id), "tenant_id": str(m.tenant_id),
                    "tenant_name": name, "label": m.label, "at": m.created_at.isoformat() if m.created_at else None} for m, name in members],
        "overrides": [{"tenant_id": str(o.tenant_id), "tenant_name": name, "status": o.status, "message": o.message,
                       "actions": o.actions or {}, "settings": o.settings or {}, "reason": o.reason,
                       "at": o.updated_at.isoformat() if o.updated_at else None} for o, name in overrides],
        "history": [{"id": str(h.id), "action": h.action, "summary": h.summary, "actor": h.actor_name,
                     "at": h.created_at.isoformat() if h.created_at else None} for h in history],
    }, message="Feature control retrieved")


@router.get("/control/{key}/impact")
async def get_feature_impact(key: str, db: DbSession, _: SuperUser):
    return success_response(data=await _impact(db, key), message="Impact retrieved")


@router.put("/control/{key}/status")
async def set_feature_status(key: str, data: StatusChange, db: DbSession, admin: SuperUser):
    """Change the status and the message businesses see, now or at a set time. Records are never touched."""
    from app.modules.tenants.models import FeatureControl
    current = (await db.execute(select(FeatureControl.status).where(FeatureControl.key == key))).scalar_one_or_none() or "active"
    if data.when == "now" and data.status in DISRUPTIVE and data.status != current and data.confirm_key != key:
        raise ValidationError(f"Type the key ({key}) to confirm: businesses lose the ability to make changes")
    await _do_status(db, admin, key, data)
    await db.commit()
    return success_response(data=None, message="Status updated")


@router.post("/control/{key}/schedule/cancel")
async def cancel_feature_schedule(key: str, data: Reason, db: DbSession, admin: SuperUser):
    target = await _control_target(db, key)
    row = await _control_row(db, key, admin.id)
    if not row.scheduled_status:
        raise ValidationError("Nothing is scheduled")
    before = _snapshot(row)
    row.scheduled_status = row.scheduled_message = row.scheduled_at = None
    await _audit(db, admin, key, "feature.schedule_cancel", f"{target['name']}: scheduled change cancelled", before, _snapshot(row), data.reason)
    await db.commit()
    return success_response(data=None, message="Schedule cancelled")


@router.put("/control/{key}/rollout")
async def set_feature_rollout(key: str, data: RolloutChange, db: DbSession, admin: SuperUser):
    """Share of businesses (stable, so a growing rollout keeps the same ones) that get it while Active or Deprecated."""
    await _do_rollout(db, admin, key, data.rollout_percent, data.reason)
    await db.commit()
    return success_response(data=None, message="Rollout updated")


@router.put("/control/{key}/kill")
async def set_feature_kill_switch(key: str, data: KillChange, db: DbSession, admin: SuperUser):
    """Stop all changes at once for every business, whatever the status. Records stay readable."""
    if data.on and data.confirm_key != key:
        raise ValidationError(f"Type the key ({key}) to stop it for every business")
    await _do_kill(db, admin, key, data.on, data.reason)
    await db.commit()
    return success_response(data=None, message="Kill switch updated")


@router.put("/control/{key}/actions")
async def set_feature_actions(key: str, data: ActionsChange, db: DbSession, admin: SuperUser):
    """Who may create, edit, delete, approve, import and export: every role, administrators, named roles, or nobody."""
    await _do_actions(db, admin, key, data.actions, data.reason)
    await db.commit()
    return success_response(data=None, message="Actions updated")


@router.put("/control/{key}/settings")
async def set_feature_settings(key: str, data: SettingsChange, db: DbSession, admin: SuperUser):
    """Settings and limits, which plans include a part, and daily limits per plan."""
    target = await _control_target(db, key)
    row = await _control_row(db, key, admin.id)
    before = _snapshot(row)
    merged = {**(row.settings or {}), **_clean_settings(key, data.settings)}
    if data.plans is not None:
        if target["level"] == "module":
            raise ValidationError("Which plans include a module is set in Plans & Billing")
        merged["plans"] = [str(p) for p in data.plans]
    if data.plan_daily_limits is not None:
        if any(v is not None and v < 0 for v in data.plan_daily_limits.values()):
            raise ValidationError("Daily limits must be 0 or more")
        merged["plan_daily_limits"] = {str(p): v for p, v in data.plan_daily_limits.items() if v is not None}
    row.settings = {k: v for k, v in merged.items() if v not in (None, "", [], {})}
    await db.flush()
    await _audit(db, admin, key, "feature.settings", f"{target['name']}: settings updated", before, _snapshot(row), data.reason)
    await db.commit()
    return success_response(data=None, message="Settings updated")


@router.put("/control/{key}/overrides/{tenant_id}")
async def set_feature_override(key: str, tenant_id: uuid.UUID, data: OverrideChange, db: DbSession, admin: SuperUser):
    """An exception for one business: its own status and message, action rules or settings. Empty fields inherit."""
    from app.modules.tenants.models import FeatureTenantOverride
    target = await _control_target(db, key)
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFoundError("Business not found")
    actions = {a: _rule(r) for a, r in data.actions.items()}  # "everyone" here opens an action Pesaa limits elsewhere
    settings = {k: v for k, v in _clean_settings(key, data.settings).items() if v not in (None, "")}
    if not (data.status or data.message or actions or settings):
        raise ValidationError("Set at least one thing that differs for this business")
    row = (await db.execute(select(FeatureTenantOverride).where(FeatureTenantOverride.feature_key == key, FeatureTenantOverride.tenant_id == tenant_id)
                            .with_for_update())).scalar_one_or_none()
    before = None if row is None else {"status": row.status, "message": row.message, "actions": row.actions, "settings": row.settings}
    if row is None:
        row = FeatureTenantOverride(feature_key=key, tenant_id=tenant_id, created_by=admin.id)
        db.add(row)
    row.status, row.message, row.actions, row.settings, row.reason = data.status, data.message or None, actions, settings, data.reason
    await db.flush()
    await _audit(db, admin, key, "feature.override", f"{target['name']}: exception set for {tenant.name}", before,
                 {"status": row.status, "message": row.message, "actions": actions, "settings": settings}, data.reason, tenant_id)
    await db.commit()
    return success_response(data=None, message="Exception saved")


@router.post("/control/{key}/overrides/{tenant_id}/remove")
async def remove_feature_override(key: str, tenant_id: uuid.UUID, data: Reason, db: DbSession, admin: SuperUser):
    from sqlalchemy import delete
    from app.modules.tenants.models import FeatureTenantOverride
    target = await _control_target(db, key)
    row = (await db.execute(select(FeatureTenantOverride).where(FeatureTenantOverride.feature_key == key, FeatureTenantOverride.tenant_id == tenant_id))).scalar_one_or_none()
    if row is None:
        raise NotFoundError("This business has no exception here")
    tenant = await db.get(Tenant, tenant_id)
    before = {"status": row.status, "message": row.message, "actions": row.actions, "settings": row.settings}
    await db.execute(delete(FeatureTenantOverride).where(FeatureTenantOverride.id == row.id))
    await _audit(db, admin, key, "feature.override_remove", f"{target['name']}: exception removed for {tenant.name if tenant else 'a business'}",
                 before, None, data.reason, tenant_id)
    await db.commit()
    return success_response(data=None, message="Exception removed")


@router.post("/control/{key}/cohort")
async def add_feature_cohort(key: str, data: CohortAdd, db: DbSession, admin: SuperUser):
    """Give a business, one branch or one user the feature while it is in Beta or rolling out."""
    from app.modules.tenants.models import Branch, FeatureCohortMember, User
    target = await _control_target(db, key)
    if data.target_type == "tenant":
        tenant = await db.get(Tenant, data.target_id)
        if tenant is None:
            raise NotFoundError("Business not found")
        tenant_id, label = tenant.id, tenant.name
    elif data.target_type == "branch":
        branch = await db.get(Branch, data.target_id)
        if branch is None:
            raise NotFoundError("Branch not found")
        tenant_id, label = branch.tenant_id, branch.name
    else:
        user = await db.get(User, data.target_id)
        if user is None or user.tenant_id is None:
            raise NotFoundError("User not found")
        tenant_id, label = user.tenant_id, f"{user.full_name} ({user.email})"
    exists = (await db.execute(select(FeatureCohortMember.id).where(
        FeatureCohortMember.feature_key == key, FeatureCohortMember.target_type == data.target_type, FeatureCohortMember.target_id == data.target_id
    ))).scalar_one_or_none()
    if exists is not None:
        raise ConflictError("Already in the cohort")
    db.add(FeatureCohortMember(feature_key=key, target_type=data.target_type, target_id=data.target_id, tenant_id=tenant_id,
                               label=label, created_by=admin.id))
    await db.flush()
    await _audit(db, admin, key, "feature.cohort_add", f"{target['name']}: {data.target_type} {label} added to the cohort", None,
                 {"target_type": data.target_type, "target_id": str(data.target_id)}, None, tenant_id)
    await db.commit()
    return success_response(data=None, message="Added to the cohort")


@router.delete("/control/{key}/cohort/{member_id}")
async def remove_feature_cohort(key: str, member_id: uuid.UUID, db: DbSession, admin: SuperUser):
    from sqlalchemy import delete
    from app.modules.tenants.models import FeatureCohortMember
    target = await _control_target(db, key)
    member = (await db.execute(select(FeatureCohortMember).where(FeatureCohortMember.id == member_id, FeatureCohortMember.feature_key == key))).scalar_one_or_none()
    if member is None:
        raise NotFoundError("Not in the cohort")
    label, tenant_id = member.label, member.tenant_id
    await db.execute(delete(FeatureCohortMember).where(FeatureCohortMember.id == member_id))
    await _audit(db, admin, key, "feature.cohort_remove", f"{target['name']}: {member.target_type} {label} removed from the cohort",
                 {"target_type": member.target_type, "target_id": str(member.target_id)}, None, None, tenant_id)
    await db.commit()
    return success_response(data=None, message="Removed from the cohort")


@router.post("/control/bulk/preview")
async def preview_bulk_change(data: BulkChange, db: DbSession, _: SuperUser):
    """What a bulk change would reach, feature by feature, before anything is applied."""
    rows = []
    for key in dict.fromkeys(data.keys):
        target = await _control_target(db, key)
        rows.append({"key": key, "name": target["name"], "level": target["level"], **await _impact(db, key, target)})
    stops = data.op == "kill" or (data.op == "status" and data.status in DISRUPTIVE)
    return success_response(data={"items": rows, "total_entitled": sum(r["entitled"] for r in rows),
                                  "total_active_30d": sum(r["active_30d"] for r in rows), "needs_confirm": stops,
                                  "confirm_text": f"APPLY {len(rows)}" if stops else None}, message="Bulk preview")


@router.post("/control/bulk/apply")
async def apply_bulk_change(data: BulkChange, db: DbSession, admin: SuperUser):
    """Apply one change to many features in one transaction: all of them or none."""
    keys = list(dict.fromkeys(data.keys))
    stops = data.op == "kill" or (data.op == "status" and data.status in DISRUPTIVE)
    if stops and data.confirm != f"APPLY {len(keys)}":
        raise ValidationError(f"Type APPLY {len(keys)} to confirm: businesses lose the ability to make changes")
    for key in keys:
        if data.op == "status":
            if data.status is None:
                raise ValidationError("Choose a status")
            await _do_status(db, admin, key, StatusChange(status=data.status, message=data.message, reason=data.reason))
        elif data.op in ("kill", "unkill"):
            await _do_kill(db, admin, key, data.op == "kill", data.reason)
        elif data.op == "actions":
            if not data.actions:
                raise ValidationError("Choose at least one action rule")
            await _do_actions(db, admin, key, data.actions, data.reason)
        elif data.op == "rollout":
            if data.rollout_percent is None:
                raise ValidationError("Choose a percentage")
            await _do_rollout(db, admin, key, data.rollout_percent, data.reason)
    await db.commit()
    return success_response(data={"applied": len(keys)}, message=f"Applied to {len(keys)} feature{'s' if len(keys) != 1 else ''}")


@router.get("/access/{tenant_id}")
async def feature_access(tenant_id: uuid.UUID, db: DbSession, _: SuperUser, user_id: uuid.UUID | None = None):
    """Every module and part for one business, or one of its users: each layer, what is decided and why, and which
    actions they can take. Without a user, actions are shown for a regular member (not an owner or administrator)."""
    from datetime import UTC
    from app.modules.billing.repository import BillingRepository
    from app.modules.tenants.models import ModuleFeature, TenantFeatureRestriction, User
    from app.modules.tenants.feature_tree import chain
    from app.modules.tenants.service.feature import resolve_modules
    from app.modules.tenants.service.feature_control import ACTIONS, Who, catalogue_names, check_action, evaluate, load, upcoming, who_for
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFoundError("Business not found")
    person = None
    if user_id is not None:
        person = await db.get(User, user_id)
        if person is None or person.tenant_id != tenant_id:
            raise NotFoundError("User not found in this business")
        who = await who_for(db, person)
    else:
        sub = await BillingRepository(db).subscription(tenant_id)
        who = Who(tenant_id=tenant_id, plan_id=getattr(sub, "plan_id", None))
    modules = await resolve_modules(db, tenant_id)
    names = await catalogue_names(db)
    parts = (await db.execute(select(ModuleFeature).order_by(ModuleFeature.module_key, ModuleFeature.sort_order))).scalars().all()
    restricted = set((await db.execute(select(TenantFeatureRestriction.feature_key).where(TenantFeatureRestriction.tenant_id == tenant_id))).scalars().all())
    keys = sorted({*modules.keys(), *(p.key for p in parts)} & set(names))
    controls = await load(db, keys, tenant_id, names)
    now = datetime.now(UTC)
    rows = []
    for key in keys:
        part = next((p for p in parts if p.key == key), None)
        module = part.module_key if part else key
        control, cohort = controls[key]
        d = evaluate(control, who, cohort, now)
        restriction = part is not None and any(k in restricted for k in chain(key))
        module_state = modules.get(module, "not_included")
        usable = module_state == "enabled" and not restriction and d.writable
        rows.append({
            "key": key, "name": control.name, "level": part.level if part else "module", "module": module, "parent": part.parent_key if part else None,
            "module_state": module_state, "restricted": restriction, "status": d.status, "visible": d.visible, "writable": d.writable,
            "message": d.message, "in_cohort": bool(cohort), "exception": control.overridden, "upcoming": upcoming(control, now),
            "result": "usable" if usable and d.visible else "read_only" if d.visible and module_state in ("enabled", "available") else "blocked",
            "actions": {a: (check_action(control, a, who) is None) and usable for a in ACTIONS},
            "action_reasons": {a: check_action(control, a, who) for a in ACTIONS if check_action(control, a, who)},
        })
    return success_response(data={"tenant": {"id": str(tenant.id), "name": tenant.name},
                                  "user": {"id": str(person.id), "name": person.full_name, "email": person.email, "role": person.role} if person else None,
                                  "as": "user" if person else "member", "plan_id": str(who.plan_id) if who.plan_id else None, "rows": rows},
                            message="Access retrieved")
