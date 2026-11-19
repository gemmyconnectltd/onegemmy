"""Pesaa's full control over every module and part: the one place its rules are decided.

For one business (and branch and user) a feature is:
  - visible:  shown in the ERP menu. Hidden while Coming soon, or while in Beta / a percentage rollout the business
              is not part of. Reads are never refused here, so records made earlier can always be looked up.
  - writable: new records and changes are accepted. Off while Inactive, Coming soon, in Maintenance, outside the beta
              or rollout, or while the kill switch is on.
  - message:  what businesses see for the current status (Pesaa's own text, or the default below).
On top, each action (create, edit, delete, approve, import, export) can be open to everyone with the role permission,
limited to owners and administrators, or switched off. Plans, the business's own switches and role permissions are
separate layers and still apply.
"""
import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.feature_tree import BY_KEY, chain, feature_for_path
from app.modules.tenants.models import FeatureCohortMember, FeatureControl, FeatureFlag, ModuleFeature

STATUSES = ("active", "inactive", "coming_soon", "beta", "maintenance", "deprecated")
ACTIONS = ("create", "edit", "delete", "approve", "import", "export")
ACTION_RULES = ("everyone", "admins", "off")
COHORT_TYPES = ("tenant", "branch", "user")

DEFAULT_MESSAGES = {
    "inactive": "{name} is switched off right now. You can still view your records.",
    "coming_soon": "{name} is coming soon.",
    "beta": "{name} is in beta. Tell us what works and what doesn't.",
    "maintenance": "{name} is under maintenance. You can still view your records; changes are paused until it is back.",
    "deprecated": "{name} is being retired. Please move to its replacement before it is switched off.",
}
KILL_MESSAGE = "{name} has been stopped for a moment. Your records are safe and can still be viewed."


@dataclass(frozen=True)
class Control:
    """A feature's control values (a feature_controls row, or the defaults when there is none)."""
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

    def effective(self, now: datetime) -> tuple[str, str | None]:
        """(status, Pesaa's message) at ``now``: a scheduled change counts from its time, saved or not."""
        if self.scheduled_status and self.scheduled_at and self.scheduled_at <= now:
            return self.scheduled_status, self.scheduled_message
        return self.status, self.message


@dataclass(frozen=True)
class Who:
    tenant_id: uuid.UUID | None
    branch_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    is_admin: bool = False


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


def check_action(c: Control, action: str | None, who: Who) -> str | None:
    """Why ``action`` is refused for ``who``, or None when it is allowed."""
    if action is None or who.tenant_id is None:
        return None
    rule = (c.actions or {}).get(action, "everyone")
    if rule == "off":
        return f"{ACTION_LABELS[action]} in {c.name} is switched off by Pesaa."
    if rule == "admins" and not who.is_admin:
        return f"{ACTION_LABELS[action]} in {c.name} is limited to business owners and administrators."
    return None


def who_for(user, branch_id: uuid.UUID | None = None) -> Who:
    role = (getattr(user, "role", None) or "").lower()
    return Who(tenant_id=user.tenant_id, branch_id=branch_id or getattr(user, "branch_id", None), user_id=user.id,
               is_admin=bool(user.tenant_id is None or getattr(user, "is_superuser", False) or role in ("admin", "owner")))


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
                   rollout_percent=row.rollout_percent, kill_switch=row.kill_switch, actions=dict(row.actions or {}))


async def load(db: AsyncSession, keys: list[str], tenant_id: uuid.UUID | None,
               names: dict[str, tuple[str, bool]] | None = None) -> dict[str, tuple[Control, set[tuple[str, uuid.UUID]]]]:
    """Controls for ``keys`` and the cohort entries that concern this business. Two queries, plus names if not given."""
    if not keys:
        return {}
    names = names if names is not None else await catalogue_names(db)
    rows = {r.key: r for r in (await db.execute(select(FeatureControl).where(FeatureControl.key.in_(keys)))).scalars().all()}
    cohorts: dict[str, set[tuple[str, uuid.UUID]]] = {k: set() for k in keys}
    if tenant_id is not None:
        for key, t, tid in (await db.execute(select(FeatureCohortMember.feature_key, FeatureCohortMember.target_type, FeatureCohortMember.target_id)
                                             .where(FeatureCohortMember.feature_key.in_(keys), FeatureCohortMember.tenant_id == tenant_id))).all():
            cohorts[key].add((t, tid))
    out = {}
    for key in keys:
        name, on = names.get(key, (BY_KEY[key].name if key in BY_KEY else key.replace("_", " ").title(), True))
        out[key] = (to_control(key, name, rows.get(key), on), cohorts[key])
    return out


def request_keys(module: str, path: str) -> list[str]:
    """The module, then every submodule and feature covering ``path``, outermost first."""
    part = feature_for_path(module, path)
    return [module, *reversed(chain(part))] if part else [module]


async def refusal(db: AsyncSession, user, module: str, method: str, path: str, branch_id: uuid.UUID | None) -> str | None:
    """Why this request is refused by Pesaa's controls, or None. Reads are only refused for exports switched off."""
    who = who_for(user, branch_id)
    action = classify(method, path)
    if action is None:
        return None
    controls = await load(db, request_keys(module, path), who.tenant_id)
    for control, cohort in controls.values():
        decision = evaluate(control, who, cohort)
        if action != "export" and not decision.writable:
            return decision.message or f"{control.name} is not available for your business yet."
        why = check_action(control, action, who)
        if why:
            return why
    return None


async def controls_for(db: AsyncSession, user, branch_id: uuid.UUID | None = None) -> dict[str, dict]:
    """What the ERP needs for the signed-in person: every module and part that is not plain active, with whether it is
    visible, writable, the message to show and the actions switched off for them."""
    who = who_for(user, branch_id)
    names = await catalogue_names(db)
    keys = [k for k, (_n, on) in names.items() if not on]
    keys += [r for r in (await db.execute(select(FeatureControl.key))).scalars().all() if r in names]
    out = {}
    for key, (control, cohort) in (await load(db, sorted(set(keys)), who.tenant_id, names)).items():
        d = evaluate(control, who, cohort)
        blocked = [a for a in ACTIONS if check_action(control, a, who)]
        if d.level == "none" and not blocked and d.visible and d.writable:
            continue
        out[key] = {"status": d.status, "visible": d.visible, "writable": d.writable, "message": d.message,
                    "level": d.level, "blocked_actions": blocked}
    return out
