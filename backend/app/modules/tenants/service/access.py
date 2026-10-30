"""Effective access: what a person (or a role) can actually do, from the layers that already exist.

Nothing here stores anything new. A person's access is the intersection of
  1. the business's module state (plan entitlement, Pesaa's restriction, the business's own on/off switch) -- resolve_modules
  2. the permissions on their one role (the business owner holds everything)
and branch scope is shown next to it (enforced elsewhere, in get_active_branch_id).
A role keeps its stored permissions while a module is off; they simply stop being effective, so nothing has to be re-granted
when the module is switched back on.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.tenants.models import Branch, FeatureFlag, Permission, Role, User
from app.modules.tenants.service.feature import ENABLED, NOT_INCLUDED, resolve_modules

ACTION_LABELS = {"read": "View", "create": "Create", "update": "Update", "delete": "Delete", "approve": "Approve"}
ACTION_ORDER = ("read", "create", "update", "delete", "approve")
WRITE_ACTIONS = ("create", "update", "delete", "approve")
BUSINESS = "business"  # resources that belong to no ERP module (people, roles, branches, billing ...)


def _module_resources() -> dict[str, tuple[str, ...]]:
    from app.core.access import (
        MODULE_RESOURCES,  # imported late: core.access imports core.deps, which imports this package
    )
    return MODULE_RESOURCES


def resource_home() -> dict[str, str]:
    """Each resource is shown under the first module that lists it (invoices under Sales, stock under Inventory ...)."""
    home: dict[str, str] = {}
    for module, resources in _module_resources().items():
        for resource in resources:
            home.setdefault(resource, module)
    return home


# Resource names are the stable permission identifiers; people read these instead.
_LABELS = {"pos": "Point of sale", "rfq": "Requests for quotation", "bom": "Bills of materials", "mrp": "Material planning", "tax": "Tax", "hr": "HR"}


def _label(resource: str) -> str:
    return _LABELS.get(resource) or resource.replace("_", " ").capitalize()


async def _names(db: AsyncSession) -> dict[str, str]:
    return {f.key: f.name for f in (await db.execute(select(FeatureFlag))).scalars().all()}


async def permission_catalog(db: AsyncSession) -> list[Permission]:
    return list((await db.execute(select(Permission).order_by(Permission.resource, Permission.action))).scalars().all())


def matrix(catalog: list[Permission], granted: set[str], everything: bool, states: dict[str, str], names: dict[str, str]) -> list[dict]:
    """Permissions grouped by module, then resource, with only the actions the catalogue really has."""
    home = resource_home()
    groups: dict[str, dict[str, dict]] = {}
    for p in catalog:
        module = home.get(p.resource, BUSINESS)
        row = groups.setdefault(module, {}).setdefault(p.resource, {"resource": p.resource, "label": _label(p.resource), "actions": {}})
        row["actions"][p.action] = {"id": str(p.id), "name": p.name, "label": ACTION_LABELS.get(p.action, p.action.title()), "granted": everything or p.name in granted}
    order = [*_module_resources().keys(), BUSINESS]
    out = []
    for module in sorted(groups, key=lambda m: order.index(m) if m in order else len(order)):
        out.append({
            "module": module, "name": "Business administration" if module == BUSINESS else names.get(module, module.title()),
            "status": None if module == BUSINESS else states.get(module, NOT_INCLUDED),
            "resources": [{**r, "actions": {a: r["actions"][a] for a in ACTION_ORDER if a in r["actions"]}} for r in sorted(groups[module].values(), key=lambda r: r["resource"])],
        })
    return out


def module_access(granted: set[str], everything: bool, states: dict[str, str], names: dict[str, str]) -> list[dict]:
    """Per ERP module: what the permissions allow, and what is effective once the business's module state is applied."""
    out = []
    for module, resources in _module_resources().items():
        view = everything or any(f"{r}:read" in granted for r in resources)
        write = everything or any(f"{r}:{a}" in granted for r in resources for a in WRITE_ACTIONS)
        status = states.get(module, NOT_INCLUDED)
        out.append({
            "key": module, "name": names.get(module, module.title()), "status": status,
            "can_view": view, "can_change": write,
            # A module the business turned off stays readable but takes no new records; one outside the plan or restricted is closed.
            "effective_view": view and status in (ENABLED, "available"),
            "effective_change": write and status == ENABLED,
        })
    return out


async def role_permission_names(db: AsyncSession, tenant_id: uuid.UUID) -> dict[uuid.UUID, set[str]]:
    rows = (await db.execute(select(Role).where(Role.tenant_id == tenant_id))).scalars().all()
    return {r.id: {p.name for p in r.permissions} for r in rows}


def is_owner(user: User) -> bool:
    return bool(user.is_superuser)


def branch_ids_of(user: User) -> set[str] | None:
    """The branches a person is limited to, read the way get_active_branch_id reads them; None means every branch.
    An explicitly empty list means no branch is assigned yet (they can't act anywhere), which is not the same as unrestricted."""
    if user.branch_ids is not None:
        return {str(b) for b in user.branch_ids if b}
    return {str(user.branch_id)} if user.branch_id else None


async def branch_scope(db: AsyncSession, tenant_id: uuid.UUID, user: User) -> dict:
    """Which branches a person works in: every branch (no restriction) or a named list."""
    ids = branch_ids_of(user)
    if ids is None:
        return {"all": True, "branches": []}
    rows = (await db.execute(select(Branch.id, Branch.name).where(Branch.tenant_id == tenant_id))).all()
    return {"all": False, "branches": [{"id": str(i), "name": n} for i, n in rows if str(i) in ids]}


async def user_access(db: AsyncSession, tenant_id: uuid.UUID, user: User) -> dict:
    states, names, catalog = await resolve_modules(db, tenant_id), await _names(db), await permission_catalog(db)
    granted = (await role_permission_names(db, tenant_id)).get(user.role_id, set()) if user.role_id else set()
    owner = is_owner(user)
    role = await db.get(Role, user.role_id) if user.role_id else None
    return {
        "user": {"id": str(user.id), "full_name": user.full_name, "email": user.email, "is_active": user.is_active, "is_owner": owner,
                 "role": role.name if role else (user.role or None), "role_id": str(user.role_id) if user.role_id else None},
        "branches": await branch_scope(db, tenant_id, user),
        "modules": module_access(granted, owner, states, names),
        "groups": matrix(catalog, granted, owner, states, names),
    }


async def role_access(db: AsyncSession, tenant_id: uuid.UUID, role: Role) -> dict:
    from sqlalchemy import func

    from app.modules.tenants.service.role import SYSTEM_ROLES
    states, names, catalog = await resolve_modules(db, tenant_id), await _names(db), await permission_catalog(db)
    granted = {p.name for p in role.permissions}
    holders = (await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant_id, User.role_id == role.id))).scalar_one()
    return {
        "role": {"id": str(role.id), "name": role.name, "description": role.description, "built_in": role.name in SYSTEM_ROLES, "users": holders, "permissions": len(granted)},
        "modules": module_access(granted, False, states, names),
        "groups": matrix(catalog, granted, False, states, names),
    }


async def access_summary(db: AsyncSession, tenant_id: uuid.UUID, *, search: str | None, role_id: uuid.UUID | None, branch_id: uuid.UUID | None,
                         status: str | None, offset: int, limit: int, assigned_only: bool = False) -> dict:
    users = (await db.execute(select(User).where(User.tenant_id == tenant_id).order_by(User.full_name))).scalars().all()
    states, names = await resolve_modules(db, tenant_id), await _names(db)
    perms = await role_permission_names(db, tenant_id)
    roles = {r.id: r.name for r in (await db.execute(select(Role).where(Role.tenant_id == tenant_id))).scalars().all()}
    branches = {b.id: b.name for b in (await db.execute(select(Branch).where(Branch.tenant_id == tenant_id))).scalars().all()}

    needle = (search or "").strip().lower()
    rows = []
    for u in users:
        mine = branch_ids_of(u)
        if needle and needle not in f"{u.full_name} {u.email}".lower():
            continue
        if role_id and u.role_id != role_id:
            continue
        if branch_id and mine is not None and str(branch_id) not in mine:
            continue  # a person with no branch restriction works in every branch, so they match any branch
        if branch_id and assigned_only and mine is None:
            continue  # a branch's own staff list names only people assigned to it
        if status == "active" and not u.is_active or status == "inactive" and u.is_active:
            continue
        granted = perms.get(u.role_id, set()) if u.role_id else set()
        access = module_access(granted, is_owner(u), states, names)
        rows.append({
            "id": str(u.id), "full_name": u.full_name, "email": u.email, "is_active": u.is_active, "is_owner": is_owner(u),
            "role": roles.get(u.role_id) or u.role, "role_id": str(u.role_id) if u.role_id else None,
            "branches": [{"id": i, "name": branches.get(uuid.UUID(i), "Unknown")} for i in sorted(mine or ())],
            "all_branches": mine is None,
            "modules": [m["key"] for m in access if m["effective_view"]],
        })
    entitled = [m for m, s in states.items() if s == ENABLED]
    return {
        "items": rows[offset:offset + limit], "total": len(rows),
        "summary": {
            "total_users": len(users), "active_users": sum(u.is_active for u in users),
            "with_role": sum(1 for u in users if u.role_id), "without_role": sum(1 for u in users if u.is_active and not u.role_id and not is_owner(u)),
            "roles": len(roles), "modules_on": len(entitled), "modules_total": len(states),
        },
    }


async def module_detail(db: AsyncSession, tenant_id: uuid.UUID, key: str) -> dict | None:
    """One module for the business administrator: which roles can use it, who holds them, and what has been changed."""
    from app.modules.audit.models import AuditLog
    states, names = await resolve_modules(db, tenant_id), await _names(db)
    if key not in states:
        return None
    resources = _module_resources().get(key, ())
    roles = (await db.execute(select(Role).where(Role.tenant_id == tenant_id).order_by(Role.name))).scalars().all()
    holders: dict[uuid.UUID | None, int] = {}
    for role_id in (await db.execute(select(User.role_id).where(User.tenant_id == tenant_id, User.is_active.is_(True)))).scalars().all():
        holders[role_id] = holders.get(role_id, 0) + 1
    rows = []
    for r in roles:
        granted = {p.name for p in r.permissions}
        view = any(f"{res}:read" in granted for res in resources)
        change = any(f"{res}:{a}" in granted for res in resources for a in WRITE_ACTIONS)
        if view or change:
            rows.append({"id": str(r.id), "name": r.name, "can_view": view, "can_change": change, "users": holders.get(r.id, 0)})
    history = (await db.execute(
        select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.entity_type == "module", AuditLog.entity_id == key)
        .order_by(AuditLog.created_at.desc()).limit(20)
    )).scalars().all()
    return {
        "key": key, "name": names.get(key, key), "status": states[key], "resources": list(resources),
        "owners": sum(1 for u in (await db.execute(select(User).where(User.tenant_id == tenant_id, User.is_active.is_(True), User.is_superuser.is_(True)))).scalars().all()),
        "roles": rows,
        "history": [{"id": str(h.id), "action": h.action, "summary": h.summary, "actor": h.actor_name, "at": h.created_at.isoformat() if h.created_at else None} for h in history],
    }
