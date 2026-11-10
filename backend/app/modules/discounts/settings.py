"""Per-business switches for discounts and promotions. With the Discounts module on, discount management works straight away
(approvals excepted, which need an approver workflow); a business can switch any part off, and turning it off never deletes anything."""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.modules.tenants.models import Role, Tenant

FLAGS = ("enabled", "manual_pos", "automatic", "campaigns", "coupons", "approvals", "advanced")
LABELS = {
    "manual_pos": "Enable Manual POS Discounts",
    "automatic": "Enable Automatic Discounts",
    "campaigns": "Enable Promotion Campaigns",
    "coupons": "Enable Coupon Codes",
    "approvals": "Enable Discount Approvals",
    "advanced": "Enable Advanced Discount Types",
}
# Roles that are never limited: the people who own or run the business.
UNLIMITED_ROLES = frozenset({"owner", "admin"})


# What a business gets before it has changed anything: discount management on, approvals off until an approver is chosen.
DEFAULT_ON = {"enabled": True, "manual_pos": True, "automatic": True, "campaigns": True, "coupons": True, "approvals": False, "advanced": True}


def defaults() -> dict:
    return {**{f: DEFAULT_ON[f] for f in FLAGS}, "authority": {"default_percent": 0, "roles": {}}}


async def load(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    raw = (
        await db.execute(select(Tenant.discount_settings).where(Tenant.id == tenant_id))
    ).scalar_one_or_none() or {}
    merged = defaults()
    merged.update({f: bool(raw.get(f, DEFAULT_ON[f])) for f in FLAGS})  # a saved choice always wins over the default
    # Discounts & Promotions is an independent module: with the module on it is always working. There is no separate
    # master switch any more (an old saved "off" is ignored); the module itself is switched in Modules.
    merged["enabled"] = True
    authority = raw.get("authority") or {}
    merged["authority"] = {
        "default_percent": float(authority.get("default_percent", 0)),
        "roles": {
            str(k).strip().lower(): float(v) for k, v in (authority.get("roles") or {}).items()
        },
    }
    return merged


def effective(settings: dict) -> dict:
    """The switches as they act: nothing works while Discount Management itself is off."""
    on = settings["enabled"]
    return {f: (on and settings[f]) for f in FLAGS if f != "enabled"} | {"enabled": on}


async def save(db: AsyncSession, tenant_id: uuid.UUID, patch: dict) -> dict:
    current = await load(db, tenant_id)
    for flag in FLAGS:
        if flag == "enabled":
            continue  # not a business switch: the module decides
        if flag in patch and patch[flag] is not None:
            current[flag] = bool(patch[flag])
    if patch.get("authority") is not None:
        authority = patch["authority"]
        roles: dict[str, float] = {}
        for name, pct in (authority.get("roles") or {}).items():
            if not str(name).strip():
                continue
            if not 0 <= float(pct) <= 100:
                raise ValidationError(f"The limit for {name} must be between 0 and 100 percent")
            roles[str(name).strip().lower()] = float(pct)
        default = float(authority.get("default_percent", 0))
        if not 0 <= default <= 100:
            raise ValidationError("The default limit must be between 0 and 100 percent")
        current["authority"] = {"default_percent": default, "roles": roles}
    tenant = await db.get(Tenant, tenant_id)
    tenant.discount_settings = current
    await db.flush()
    return current


async def authority_percent(db: AsyncSession, user, settings: dict) -> Decimal | None:
    """The most this person may take off by hand, as a percent of the sale. None means no limit (owners, administrators and the platform)."""
    if user.is_superuser:
        return None
    role = (user.role or "").strip().lower()
    if user.role_id:
        row = await db.get(Role, user.role_id)
        if row is not None:
            role = row.name.strip().lower()
    if role in UNLIMITED_ROLES:
        return None
    authority = settings["authority"]
    if role in authority["roles"]:
        return Decimal(str(authority["roles"][role]))
    return Decimal(str(authority["default_percent"]))
