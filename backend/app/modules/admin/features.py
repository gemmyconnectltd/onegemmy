"""Super Admin Feature Directory: the platform's feature catalogue, where each feature is sold and how far it is used.

Three different numbers are kept apart on purpose (see the Platform Usage rules in usage.py):
  - entitled: businesses whose plan (or, with no plan, the catalogue default) includes the feature
  - active:    entitled businesses that have not been switched off by Pesaa or by their own administrator
  - using:     businesses with at least one record in the module's own table (real adoption)
Features are tied to code (routers, permissions), so the catalogue can be edited and switched off but not invented here.
"""
import uuid
from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, select

from app.core.config import settings
from app.core.deps import DbSession, SuperUser
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.response import success_response
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


async def _tenant_counts(db: DbSession, flags: list[FeatureFlag]) -> dict[str, dict[str, int]]:
    """entitled / active per feature, from one pass over the businesses (the same rules as resolve_modules)."""
    rows = (await db.execute(
        select(Tenant.features, Tenant.module_activation, BillingSubscription.terms, BillingSubscription.status)
        .select_from(Tenant).outerjoin(BillingSubscription, BillingSubscription.tenant_id == Tenant.id)
        .where(Tenant.archived_at.is_(None))
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


async def _using(db: DbSession, key: str) -> int | None:
    if key not in MODULES:
        return None
    model = MODULES[key][1]
    return (await db.execute(select(func.count(func.distinct(model.tenant_id))).select_from(model))).scalar_one()


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
async def feature_directory(db: DbSession, _: SuperUser):
    flags = (await db.execute(select(FeatureFlag).order_by(FeatureFlag.module, FeatureFlag.key))).scalars().all()
    names, plans, counts = {f.key: f.name for f in flags}, await _plans_by_feature(db), await _tenant_counts(db, list(flags))
    items = []
    for f in flags:
        items.append({**_row(f, names, plans, counts), "using_tenants": await _using(db, f.key)})
    total = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.archived_at.is_(None)))).scalar_one()
    return success_response(data={"features": items, "total_tenants": total}, message="Feature directory retrieved")


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
