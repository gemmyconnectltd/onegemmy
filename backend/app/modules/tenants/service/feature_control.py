"""Pesaa's full control over every module and part: the one place its rules are decided.

For one business (and branch, user and plan) a feature is:
  - visible:  shown in the ERP. Hidden while Coming soon, in Beta / a percentage rollout the business is not part of,
              or when the part is not in the business's plan. Reads are never refused here, so earlier records stay
              reachable.
  - writable: new records and changes are accepted. Off while Inactive, Coming soon, in Maintenance, outside the beta,
              rollout or plan, while the kill switch is on, or while a part it depends on is not writable.
  - message:  what businesses see for the current status (Pesaa's own text, or the default below).
Each action (create, edit, delete, approve, import, export) can be open to every role that holds the permission,
limited to owners and administrators, limited to named roles, or switched off. Settings add a daily limit on new
records (also per plan), hours when changes are accepted, how early businesses are warned of a scheduled change, and
feature-specific rules read by the module's own code (get_setting). A business can have its own exception for any of
these. Plans, the business's own switches and role permissions are separate layers and still apply.
"""
import hashlib
import uuid
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.feature_tree import BY_KEY, PART_DEPENDENCIES, chain, feature_for_path
from app.modules.tenants.models import (
    FeatureActivity, FeatureCohortMember, FeatureControl, FeatureFlag, FeatureTenantOverride, ModuleFeature,
)

STATUSES = ("active", "inactive", "coming_soon", "beta", "maintenance", "deprecated")
ACTIONS = ("create", "edit", "delete", "approve", "import", "export")
ACTION_RULES = ("everyone", "admins", "off")  # or {"roles": ["cashier", ...]}
COHORT_TYPES = ("tenant", "branch", "user")
ADMIN_ROLES = ("admin", "owner")

DEFAULT_MESSAGES = {
    "inactive": "{name} is switched off right now. You can still view your records.",
    "coming_soon": "{name} is coming soon.",
    "beta": "{name} is in beta. Tell us what works and what doesn't.",
    "maintenance": "{name} is under maintenance. You can still view your records; changes are paused until it is back.",
    "deprecated": "{name} is being retired. Please move to its replacement before it is switched off.",
}
KILL_MESSAGE = "{name} has been stopped for a moment. Your records are safe and can still be viewed."
NOT_IN_PLAN = "{name} is not part of your plan. An owner can upgrade in Subscription & Billing."


@dataclass(frozen=True)
class SettingDef:
    name: str
    label: str
    kind: str  # int | number | hours | text
    default: object = None
    help: str = ""


# Settings every module and part has. The engine enforces them.
COMMON_SETTINGS = (
    SettingDef("daily_create_limit", "Daily limit on new records", "int", None,
               "New records one business may add per day. Empty for no limit. A limit per plan below wins."),
    SettingDef("write_hours", "Changes accepted between", "hours", None, "For example 07:00-20:00. Empty for any time."),
    SettingDef("timezone", "Time zone for those hours", "text", "Africa/Kigali", "An IANA time zone, e.g. Africa/Accra."),
    SettingDef("notice_hours", "Warn businesses before a scheduled change (hours)", "int", 24,
               "Businesses see the coming change this long before it happens."),
)
# Rules a module's own code reads with get_setting(). Each one listed here is enforced where it is named.
FEATURE_SETTINGS: dict[str, tuple[SettingDef, ...]] = {
    "sales.returns": (
        SettingDef("return_window_days", "Returns allowed within (days of the sale)", "int", None,
                   "Empty for no limit. Enforced when a return is recorded against a sale."),
        SettingDef("approval_above", "Refunds above this amount need approval", "number", None,
                   "A return above it must be recorded as Pending so a manager approves it."),
    ),
}


def settings_for(key: str) -> tuple[SettingDef, ...]:
    return COMMON_SETTINGS + FEATURE_SETTINGS.get(key, ())


@dataclass(frozen=True)
class Control:
    """A feature's control values (a feature_controls row merged with this business's exception, or the defaults)."""
    key: str
    name: str
    status: str = "active"
    message: str | None = None
    scheduled_status: str | None = None
    scheduled_message: str | None = None
    scheduled_at: datetime | None = None
    rollout_percent: int = 100
    kill_switch: bool = False
    actions: dict = field(default_factory=dict)
    settings: dict = field(default_factory=dict)
    overridden: bool = False  # this business has an exception
    status_overridden: bool = False  # ... that sets its own status, so the platform's schedule does not apply to it

    def effective(self, now: datetime) -> tuple[str, str | None]:
        """(status, Pesaa's message) at ``now``: a scheduled change counts from its time, saved or not."""
        if self.scheduled_status and self.scheduled_at and self.scheduled_at <= now and not self.status_overridden:
            return self.scheduled_status, self.scheduled_message
        return self.status, self.message

    def setting(self, name: str):
        if name in self.settings and self.settings[name] not in (None, ""):
            return self.settings[name]
        return next((s.default for s in settings_for(self.key) if s.name == name), None)


@dataclass(frozen=True)
class Who:
    tenant_id: uuid.UUID | None
    branch_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    is_admin: bool = False
    role: str | None = None
    plan_id: uuid.UUID | None = None


@dataclass(frozen=True)
class Decision:
    status: str
    visible: bool
    writable: bool
    message: str | None
    level: str  # none | info | warning | blocked


def bucket(key: str, tenant_id: uuid.UUID) -> int:
    """0-99, stable for a business and feature, so a percentage rollout keeps the same businesses as it grows."""
    return int(hashlib.sha256(f"{key}:{tenant_id}".encode()).hexdigest()[:8], 16) % 100


def in_cohort(cohort: set[tuple[str, uuid.UUID]], who: Who) -> bool:
    return any(t in cohort for t in (("tenant", who.tenant_id), ("branch", who.branch_id), ("user", who.user_id)) if t[1])


def in_plan(c: Control, who: Who) -> bool:
    from app.core.config import settings as app_settings
    plans = c.settings.get("plans") or []
    if not plans or who.plan_id is None or not app_settings.ENFORCE_PLAN_ENTITLEMENTS:
        return True
    return str(who.plan_id) in {str(p) for p in plans}


def merge(c: Control, override: FeatureTenantOverride | None) -> Control:
    """This business's exception on top of the platform control. Empty fields inherit."""
    if override is None:
        return c
    settings = {**c.settings, **{k: v for k, v in (override.settings or {}).items() if v not in (None, "")}}
    return replace(c, status=override.status or c.status, message=override.message or (c.message if not override.status else None),
                   actions={**c.actions, **(override.actions or {})}, settings=settings, overridden=True,
                   status_overridden=bool(override.status))


def evaluate(c: Control, who: Who, cohort: set[tuple[str, uuid.UUID]], now: datetime | None = None) -> Decision:
    status, custom = c.effective(now or datetime.now(UTC))
    text = (custom or DEFAULT_MESSAGES.get(status, "") or "").format(name=c.name) or None
    if who.tenant_id is None:  # Pesaa staff
        return Decision(status, True, True, text, "none")
    member = in_cohort(cohort, who)
    if status == "coming_soon":
        return Decision(status, False, False, text, "blocked")
    if status == "beta" and not member:
        return Decision(status, False, False, None, "blocked")
    if not member and not in_plan(c, who):
        return Decision(status, False, False, NOT_IN_PLAN.format(name=c.name), "blocked")
    if status in ("active", "deprecated") and c.rollout_percent < 100 and not member and bucket(c.key, who.tenant_id) >= c.rollout_percent:
        return Decision(status, False, False, None, "blocked")
    if c.kill_switch:
        return Decision(status, True, False, KILL_MESSAGE.format(name=c.name), "blocked")
    if status in ("inactive", "maintenance"):
        return Decision(status, True, False, text, "warning")
    if status in ("beta", "deprecated"):
        return Decision(status, True, True, text, "info" if status == "beta" else "warning")
    return Decision(status, True, True, None, "none")


def classify(method: str, path: str) -> str | None:
    """The action a request performs, or None for a plain read."""
    method, path = method.upper(), path.rstrip("/")
    last = path.rsplit("/", 1)[-1]
    if method in ("GET", "HEAD", "OPTIONS"):
        return "export" if "export" in last else None
    if last in ("import", "bulk") or "/import" in path:
        return "import"
    if method == "DELETE":
        return "delete"
    if last in ("approve", "reject", "decision", "approve-and-run") or "/approve" in path:
        return "approve"
    if method in ("PUT", "PATCH"):
        return "edit"
    return "create"


ACTION_LABELS = {"create": "Creating", "edit": "Editing", "delete": "Deleting", "approve": "Approving",
                 "import": "Importing", "export": "Exporting"}


def rule_roles(rule) -> list[str] | None:
    if isinstance(rule, dict):
        return [str(r).strip().lower() for r in rule.get("roles") or [] if str(r).strip()]
    return None


def check_action(c: Control, action: str | None, who: Who) -> str | None:
    """Why ``action`` is refused for ``who``, or None when it is allowed."""
    if action is None or who.tenant_id is None:
        return None
    rule = (c.actions or {}).get(action, "everyone")
    roles = rule_roles(rule)
    if roles is not None:
        if who.is_admin or (who.role or "").strip().lower() in roles:
            return None
        return f"{ACTION_LABELS[action]} in {c.name} is limited to: {', '.join(r.title() for r in roles)}."
    if rule == "off":
        return f"{ACTION_LABELS[action]} in {c.name} is switched off by Pesaa."
    if rule == "admins" and not who.is_admin:
        return f"{ACTION_LABELS[action]} in {c.name} is limited to business owners and administrators."
    return None


def parse_hours(value: str) -> tuple[time, time] | None:
    try:
        start, end = (time.fromisoformat(p.strip()) for p in value.split("-", 1))
        return start, end
    except (ValueError, AttributeError):
        return None


def outside_hours(c: Control, now: datetime) -> str | None:
    window = c.setting("write_hours")
    hours = parse_hours(window) if window else None
    if hours is None:
        return None
    try:
        local = now.astimezone(ZoneInfo(str(c.setting("timezone") or "Africa/Kigali"))).time()
    except (KeyError, ValueError):
        local = now.time()
    start, end = hours
    inside = start <= local < end if start <= end else (local >= start or local < end)
    return None if inside else f"Changes in {c.name} are accepted between {window}."


def daily_limit(c: Control, who: Who) -> int | None:
    per_plan = c.settings.get("plan_daily_limits") or {}
    value = per_plan.get(str(who.plan_id)) if who.plan_id else None
    value = value if value not in (None, "") else c.setting("daily_create_limit")
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def upcoming(c: Control, now: datetime) -> dict | None:
    """A scheduled change businesses should be warned about now."""
    if not c.scheduled_status or not c.scheduled_at or c.scheduled_at <= now or c.status_overridden:
        return None
    try:
        hours = int(c.setting("notice_hours") or 0)
    except (TypeError, ValueError):
        hours = 24
    if c.scheduled_at - now > timedelta(hours=hours):
        return None
    message = (c.scheduled_message or DEFAULT_MESSAGES.get(c.scheduled_status, "") or "").format(name=c.name) or None
    return {"status": c.scheduled_status, "at": c.scheduled_at.isoformat(), "message": message}


async def who_for(db: AsyncSession, user, branch_id: uuid.UUID | None = None) -> Who:
    role = (getattr(user, "role", None) or "").lower()
    plan_id = None
    if user.tenant_id is not None:
        from app.modules.billing.repository import BillingRepository
        sub = await BillingRepository(db).subscription(user.tenant_id)
        plan_id = getattr(sub, "plan_id", None)
    return Who(tenant_id=user.tenant_id, branch_id=branch_id or getattr(user, "branch_id", None), user_id=user.id,
               is_admin=bool(user.tenant_id is None or getattr(user, "is_superuser", False) or role in ADMIN_ROLES),
               role=role or None, plan_id=plan_id)


async def catalogue_names(db: AsyncSession) -> dict[str, tuple[str, bool]]:
    """key -> (name, catalogue switch) for every module and part."""
    out = {k: (n, a) for k, n, a in (await db.execute(select(FeatureFlag.key, FeatureFlag.name, FeatureFlag.is_active))).all()}
    out.update({k: (n, a) for k, n, a in (await db.execute(select(ModuleFeature.key, ModuleFeature.name, ModuleFeature.is_active))).all()})
    return out


def to_control(key: str, name: str, row: FeatureControl | None, catalogue_on: bool = True) -> Control:
    if row is None:
        return Control(key=key, name=name, status="active" if catalogue_on else "inactive")
    status = row.status if catalogue_on or row.status != "active" else "inactive"
    return Control(key=key, name=name, status=status, message=row.message, scheduled_status=row.scheduled_status,
                   scheduled_message=row.scheduled_message, scheduled_at=row.scheduled_at,
                   rollout_percent=row.rollout_percent, kill_switch=row.kill_switch, actions=dict(row.actions or {}),
                   settings=dict(getattr(row, "settings", None) or {}))


async def load(db: AsyncSession, keys: list[str], tenant_id: uuid.UUID | None,
               names: dict[str, tuple[str, bool]] | None = None) -> dict[str, tuple[Control, set[tuple[str, uuid.UUID]]]]:
    """Controls for ``keys``, with this business's exceptions applied, and the cohort entries that concern it."""
    if not keys:
        return {}
    names = names if names is not None else await catalogue_names(db)
    rows = {r.key: r for r in (await db.execute(select(FeatureControl).where(FeatureControl.key.in_(keys)))).scalars().all()}
    cohorts: dict[str, set[tuple[str, uuid.UUID]]] = {k: set() for k in keys}
    overrides: dict[str, FeatureTenantOverride] = {}
    if tenant_id is not None:
        for key, t, tid in (await db.execute(select(FeatureCohortMember.feature_key, FeatureCohortMember.target_type, FeatureCohortMember.target_id)
                                             .where(FeatureCohortMember.feature_key.in_(keys), FeatureCohortMember.tenant_id == tenant_id))).all():
            cohorts[key].add((t, tid))
        overrides = {o.feature_key: o for o in (await db.execute(select(FeatureTenantOverride).where(
            FeatureTenantOverride.feature_key.in_(keys), FeatureTenantOverride.tenant_id == tenant_id))).scalars().all()}
    out = {}
    for key in keys:
        name, on = names.get(key, (BY_KEY[key].name if key in BY_KEY else key.replace("_", " ").title(), True))
        out[key] = (merge(to_control(key, name, rows.get(key), on), overrides.get(key)), cohorts[key])
    return out


def request_keys(module: str, path: str) -> list[str]:
    """The module, then every submodule and feature covering ``path``, outermost first."""
    part = feature_for_path(module, path)
    return [module, *reversed(chain(part))] if part else [module]


async def creates_today(db: AsyncSession, tenant_id: uuid.UUID, key: str, today: date) -> int:
    return int((await db.execute(select(func.coalesce(func.sum(FeatureActivity.count), 0)).where(
        FeatureActivity.tenant_id == tenant_id, FeatureActivity.feature_key == key, FeatureActivity.day == today,
        FeatureActivity.action == "create"))).scalar_one())


@dataclass(frozen=True)
class Verdict:
    refused: str | None
    record_key: str | None = None
    action: str | None = None


async def judge(db: AsyncSession, user, module: str, method: str, path: str, branch_id: uuid.UUID | None,
                now: datetime | None = None) -> Verdict:
    """Whether Pesaa's controls accept this request, and which feature to count it against when they do."""
    action = classify(method, path)
    if action is None:
        return Verdict(None)
    now = now or datetime.now(UTC)
    who = await who_for(db, user, branch_id)
    keys = request_keys(module, path)
    deps = [d for d in PART_DEPENDENCIES.get(keys[-1], ())]
    controls = await load(db, keys + deps, who.tenant_id)
    for key in keys:
        control, cohort = controls[key]
        decision = evaluate(control, who, cohort, now)
        if action != "export" and not decision.writable:
            return Verdict(decision.message or f"{control.name} is not available for your business yet.")
        why = check_action(control, action, who) or (outside_hours(control, now) if action != "export" else None)
        if why:
            return Verdict(why)
        limit = daily_limit(control, who) if action == "create" and who.tenant_id else None
        if limit is not None and await creates_today(db, who.tenant_id, key, now.date()) >= limit:
            return Verdict(f"{control.name} allows {limit} new record{'s' if limit != 1 else ''} a day for your business. Try again tomorrow.")
    if action != "export":
        for dep in deps:
            control, cohort = controls[dep]
            if not evaluate(control, who, cohort, now).writable:
                return Verdict(f"{controls[keys[-1]][0].name} needs {control.name}, which is not available right now.")
    return Verdict(None, record_key=keys[-1] if who.tenant_id else None, action=action)


async def record(db: AsyncSession, tenant_id: uuid.UUID, key: str, action: str, today: date | None = None) -> None:
    """Count an accepted change. Same transaction as the change, so a failed change is not counted."""
    stmt = insert(FeatureActivity).values(tenant_id=tenant_id, feature_key=key, day=today or datetime.now(UTC).date(), action=action, count=1)
    await db.execute(stmt.on_conflict_do_update(index_elements=["tenant_id", "feature_key", "day", "action"],
                                                set_={"count": FeatureActivity.count + 1}))


async def get_setting(db: AsyncSession, key: str, name: str, tenant_id: uuid.UUID | None):
    """A setting's value for this business: its exception, else Pesaa's value, else the default. For module code."""
    control, _ = (await load(db, [key], tenant_id))[key]
    return control.setting(name)


async def controls_for(db: AsyncSession, user, branch_id: uuid.UUID | None = None) -> dict[str, dict]:
    """What the ERP needs for the signed-in person: every module and part that is not plain active, with whether it is
    visible, writable, the message to show, the actions blocked for them and any change coming soon."""
    who = await who_for(db, user, branch_id)
    now = datetime.now(UTC)
    names = await catalogue_names(db)
    keys = {k for k, (_n, on) in names.items() if not on}
    keys |= {r for r in (await db.execute(select(FeatureControl.key))).scalars().all() if r in names}
    if who.tenant_id is not None:
        keys |= {r for r in (await db.execute(select(FeatureTenantOverride.feature_key).where(FeatureTenantOverride.tenant_id == who.tenant_id))).scalars().all() if r in names}
    out = {}
    for key, (control, cohort) in (await load(db, sorted(keys), who.tenant_id, names)).items():
        d = evaluate(control, who, cohort, now)
        blocked = [a for a in ACTIONS if check_action(control, a, who)]
        soon = upcoming(control, now)
        hours = control.setting("write_hours")
        if d.level == "none" and not blocked and d.visible and d.writable and not soon and not hours:
            continue
        out[key] = {"status": d.status, "visible": d.visible, "writable": d.writable, "message": d.message,
                    "level": d.level, "blocked_actions": blocked, "upcoming": soon, "write_hours": hours}
    return out
