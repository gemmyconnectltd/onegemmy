import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.tenants.models import Permission, Role
from app.modules.tenants.repository import RoleRepository
from app.modules.tenants.schemas import RoleCreate, RoleRead, RoleUpdate

# Same resource/action taxonomy as scripts/seed.py's demo-data permission
# matrix (kept as its own copy rather than a shared import, so a change to
# the demo seeder's business-role set can't accidentally affect what every
# real tenant gets by default). MODULE_RESOURCES in frontend/src/lib/auth.tsx
# maps sidebar modules to a subset of these resources.
_PERMISSION_RESOURCES = [
    "tenants", "users", "roles", "permissions", "departments", "branches", "billing",
    "approvals",
    "items", "warehouses", "stock", "orders", "pricing", "returns",
    "invoices", "pos",
    "chart_of_accounts", "journal_entries", "accounts_payable",
    "accounts_receivable", "banking", "fixed_assets", "budgeting", "expenses", "tax",
    "employees", "organization", "recruitment", "attendance", "leave",
    "payroll", "performance",
    "vendors", "requisitions", "rfq", "purchase_orders", "goods_receipt", "contracts",
    "leads", "accounts", "contacts", "opportunities", "activities", "campaigns", "tickets",
    "bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing",
    "services", "appointments", "queue", "service_commissions",
    # Customer credit control: credit:approve = approve credit sales over the daily limit and set that limit.
    "credit",
]
_PERMISSION_ACTIONS = ["create", "read", "update", "delete", "approve"]

# Owner/tenant-administration resources: managing the tenant record itself,
# users, roles and permissions. The default "Member"/"Viewer" roles exclude
# these — only "Admin" (and the tenant owner, who bypasses role checks
# entirely via is_superuser) can manage who else has access.
# "approvals": whoever decides requests is chosen deliberately (granted on a role), never handed out by a template.
_ADMIN_ONLY_RESOURCES = {"tenants", "users", "roles", "permissions", "credit", "billing", "approvals"}

# What an invite's free-text role ("admin"/"member"/"viewer", whatever the
# inviter typed or picked) maps to among the seeded defaults. Unrecognized
# values resolve to an existing custom role by name; unknown roles are rejected.
# Narrow, job-shaped templates: resource → the actions the role gets. Nothing outside these lists is granted.
_CRUD = ("create", "read", "update")
FOCUSED_ROLES: dict[str, tuple[str, dict[str, tuple[str, ...]]]] = {
    "Cashier": ("Runs the till: sells, takes payment and looks up products and customers. No finance or admin access.", {
        "pos": _CRUD, "orders": ("create", "read"), "invoices": ("read",), "items": ("read",), "stock": ("read",), "pricing": ("read",),
        "contacts": ("create", "read"), "returns": ("read",),
    }),
    "Accountant": ("Keeps the books: accounting, expenses, tax, banking and payables/receivables. Can approve finance entries; can't change inventory or staff.", {
        "chart_of_accounts": _CRUD, "journal_entries": (*_CRUD, "approve"), "accounts_payable": (*_CRUD, "approve"), "accounts_receivable": (*_CRUD, "approve"),
        "banking": _CRUD, "fixed_assets": _CRUD, "budgeting": _CRUD, "tax": _CRUD, "expenses": (*_CRUD, "approve"), "invoices": _CRUD,
        "orders": ("read",), "items": ("read",), "contacts": ("read",), "vendors": ("read",), "purchase_orders": ("read",), "payroll": ("read",),
    }),
    "Inventory Officer": ("Looks after stock: products, warehouses, receiving and counts. Can raise purchase requests; can't see finance.", {
        "items": _CRUD, "warehouses": _CRUD, "stock": _CRUD, "pricing": ("read", "update"), "returns": ("read",), "vendors": ("read",),
        "requisitions": ("create", "read"), "purchase_orders": ("read",), "goods_receipt": _CRUD,
    }),
}

# The roles every business is given. They can be tuned (permissions) but never renamed or deleted.
SYSTEM_ROLES = frozenset({"Admin", "Member", "Viewer", "Owner/CEO", "General Manager", "Branch Manager", "Factory Manager",
                          "Cashier", "Accountant", "Inventory Officer"})

_ROLE_NAME_ALIASES = {"cashier": "Cashier", "accountant": "Accountant", "inventory officer": "Inventory Officer", "admin": "Admin", "owner": "Admin", "member": "Member", "viewer": "Viewer",
                      "owner/ceo": "Owner/CEO", "general manager": "General Manager",
                      "branch manager": "Branch Manager", "factory manager": "Factory Manager"}


async def get_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> RoleRead:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    return RoleRead.model_validate(role)


async def get_role_by_name(db: AsyncSession, tenant_id: uuid.UUID, name: str) -> Role | None:
    return await RoleRepository(db).get_by_name_for_tenant(tenant_id, name)


async def create_role(db: AsyncSession, tenant_id: uuid.UUID, data: RoleCreate) -> RoleRead:
    existing = await get_role_by_name(db, tenant_id, data.name)
    if existing:
        raise ConflictError("Role with this name already exists")
    role = Role(tenant_id=tenant_id, name=data.name, description=data.description)
    role = await RoleRepository(db).save(role)
    await db.commit()
    return RoleRead.model_validate(role)


async def list_roles(db: AsyncSession, tenant_id: uuid.UUID, offset: int, limit: int) -> list[RoleRead]:
    roles = await RoleRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [RoleRead.model_validate(r) for r in roles]


async def count_roles(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return await RoleRepository(db).count_for_tenant(tenant_id)


async def update_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID, data: RoleUpdate) -> RoleRead:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    changes = data.model_dump(exclude_unset=True)
    if role.name in SYSTEM_ROLES and changes.get("name") not in (None, role.name):
        raise ConflictError(f"{role.name} is a built-in role and can't be renamed. Create a custom role instead.")
    for field, value in changes.items():
        setattr(role, field, value)
    role = await RoleRepository(db).save(role)
    await db.commit()
    return RoleRead.model_validate(role)


async def delete_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> None:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    if role.name in SYSTEM_ROLES:
        raise ConflictError(f"{role.name} is a built-in role and can't be deleted.")
    from sqlalchemy import func

    from app.modules.tenants.models import User
    assigned = (await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant_id, User.role_id == role_id))).scalar_one()
    if assigned:
        raise ConflictError(f"{assigned} {'person has' if assigned == 1 else 'people have'} this role. Move them to another role first.")
    await RoleRepository(db).delete(role)
    await db.commit()


async def ensure_permissions_seeded(db: AsyncSession) -> list[Permission]:
    """Idempotently ensures the global permission catalog exists. Permissions
    are shared platform-wide (not tenant-scoped, see the Permission model),
    so this only ever needs to insert once, but is safe to call on every
    tenant registration — it's a no-op past the first call."""
    existing = (await db.execute(select(Permission))).scalars().all()
    existing_names = {p.name for p in existing}
    for resource in _PERMISSION_RESOURCES:
        for action in _PERMISSION_ACTIONS:
            name = f"{resource}:{action}"
            if name not in existing_names:
                db.add(Permission(name=name, resource=resource, action=action, description=f"Can {action} {resource}"))
    await db.flush()
    return list((await db.execute(select(Permission))).scalars().all())


async def seed_default_roles(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """Seed missing business templates without changing existing grants or revocations."""
    all_permissions = await ensure_permissions_seeded(db)
    existing = {r.name: r for r in await RoleRepository(db).template_roles(tenant_id)}

    if "Admin" in existing:
        pass  # Preserve deliberate grants and revocations.
    else:
        db.add(Role(
            tenant_id=tenant_id, name="Admin", permissions=all_permissions,
            description="Full access, same as the account owner.",
        ))

    # Everything operational, including delete and approve — for roles that are meant to run a location (Branch Manager).
    ops_perms = [p for p in all_permissions if p.resource not in _ADMIN_ONLY_RESOURCES]
    # The everyday default for a new team member: create, view and edit — but never delete or approve anything.
    member_perms = [p for p in ops_perms if p.action in {"create", "read", "update"}]
    if "Member" in existing:
        pass  # Preserve deliberate grants and revocations.
    else:
        db.add(Role(
            tenant_id=tenant_id, name="Member", permissions=member_perms,
            description="Day-to-day work: create, view and edit records. Can't delete or approve, or manage users, roles or settings.",
        ))

    viewer_perms = [p for p in all_permissions if p.action == "read" and p.resource not in _ADMIN_ONLY_RESOURCES]
    if "Viewer" in existing:
        pass  # Preserve deliberate grants and revocations.
    else:
        db.add(Role(
            tenant_id=tenant_id, name="Viewer", permissions=viewer_perms,
            description="Read-only access across modules.",
        ))
    templates = {
        "Owner/CEO": all_permissions,
        "General Manager": [p for p in all_permissions if p.resource not in {"roles", "permissions", "billing", "tenants"}],
        "Branch Manager": [p for p in ops_perms if p.resource not in {"bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing", "branches"}],
        "Factory Manager": [p for p in all_permissions if p.resource in {"bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing", "stock", "items", "warehouses"}],
    }
    for name, permissions in templates.items():
        if name not in existing:
            db.add(Role(tenant_id=tenant_id, name=name, permissions=permissions,
                        description="Configurable business role template; branch assignments are managed separately."))
    for name, (description, grants) in FOCUSED_ROLES.items():
        if name not in existing:
            db.add(Role(tenant_id=tenant_id, name=name, description=description,
                        permissions=[p for p in all_permissions if p.action in grants.get(p.resource, ())]))
    await db.flush()


async def resolve_role_id(db: AsyncSession, tenant_id: uuid.UUID, role_str: str) -> uuid.UUID | None:
    """Maps an invite's free-text role to a real, permission-bearing Role
    row's id. Seeds the tenant's default roles first if it has none yet, so
    this works even for tenants that registered before default roles existed
    — it's the single place both invite flows (admin_invite_user and the
    tenant self-service create_user) resolve a role into real access."""
    name = _ROLE_NAME_ALIASES.get(role_str.strip().lower(), role_str.strip())
    role = await get_role_by_name(db, tenant_id, name)
    if role is None:
        await seed_default_roles(db, tenant_id)
        role = await get_role_by_name(db, tenant_id, name)
    return role.id if role else None


async def review_roles(db: AsyncSession, tenant_id: uuid.UUID) -> list[dict]:
    """Which roles can delete or approve outside the admin-only areas, and how many people hold each — so an owner can decide
    whether to tighten them. Nothing changes until `tighten_member_role` is called."""
    from sqlalchemy import func

    from app.modules.tenants.models import User

    roles = (await db.execute(select(Role).where(Role.tenant_id == tenant_id).order_by(Role.name))).scalars().all()
    counts = dict((await db.execute(select(User.role_id, func.count()).where(User.tenant_id == tenant_id, User.is_active.is_(True)).group_by(User.role_id))).all())
    out = []
    for r in roles:
        names = [p.name for p in r.permissions if p.resource not in _ADMIN_ONLY_RESOURCES]
        out.append({
            "id": str(r.id), "name": r.name, "users": counts.get(r.id, 0), "permissions": len(r.permissions),
            "deletePermissions": sum(n.endswith(":delete") for n in names), "approvePermissions": sum(n.endswith(":approve") for n in names),
            "builtIn": r.name in SYSTEM_ROLES,
            "canTighten": r.name == "Member" and any(n.endswith((":delete", ":approve")) for n in names),
        })
    return out


async def tighten_member_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> int:
    """Removes delete and approve permissions from the built-in Member role (the recommended baseline). Returns how many
    permissions were removed. An explicit owner action; custom roles are never touched."""
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
    if role.name != "Member":
        raise ConflictError("Only the built-in Member role can be tightened this way")
    keep = [p for p in role.permissions if p.action in {"create", "read", "update"}]
    removed = len(role.permissions) - len(keep)
    role.permissions = keep
    await db.flush()
    return removed
