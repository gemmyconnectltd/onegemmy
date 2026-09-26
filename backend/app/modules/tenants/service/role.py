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
    "tenants", "users", "roles", "permissions", "departments", "branches",
    "items", "warehouses", "stock", "orders", "pricing", "returns",
    "invoices", "pos",
    "chart_of_accounts", "journal_entries", "accounts_payable",
    "accounts_receivable", "banking", "fixed_assets", "budgeting", "tax",
    "employees", "organization", "recruitment", "attendance", "leave",
    "payroll", "performance",
    "vendors", "requisitions", "rfq", "purchase_orders", "goods_receipt", "contracts",
    "leads", "accounts", "contacts", "opportunities", "activities", "campaigns", "tickets",
    "bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing",
]
_PERMISSION_ACTIONS = ["create", "read", "update", "delete", "approve"]

# Owner/tenant-administration resources: managing the tenant record itself,
# users, roles and permissions. The default "Member"/"Viewer" roles exclude
# these — only "Admin" (and the tenant owner, who bypasses role checks
# entirely via is_superuser) can manage who else has access.
_ADMIN_ONLY_RESOURCES = {"tenants", "users", "roles", "permissions"}

# What an invite's free-text role ("admin"/"member"/"viewer", whatever the
# inviter typed or picked) maps to among the seeded defaults. Unrecognized
# values fall back to "Member" — a safe, working default rather than no
# permissions at all.
_ROLE_NAME_ALIASES = {"admin": "Admin", "owner": "Admin", "member": "Member", "viewer": "Viewer"}


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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(role, field, value)
    role = await RoleRepository(db).save(role)
    await db.commit()
    return RoleRead.model_validate(role)


async def delete_role(db: AsyncSession, tenant_id: uuid.UUID, role_id: uuid.UUID) -> None:
    role = await RoleRepository(db).get_by_id_for_tenant(tenant_id, role_id)
    if role is None:
        raise NotFoundError("Role not found")
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
    """Every tenant needs Admin/Member/Viewer roles with real permissions
    from the moment it exists — without them, any user invited after the
    owner gets role_id=None (see resolve_role_id below, which invite flows
    use to turn an invite's role string into one of these), meaning zero
    permissions and an almost-empty sidebar (only Dashboard/Reports/Settings,
    since every other nav item is gated on a module permission check).
    Idempotent per role name, so it's also safe to call for tenants that
    registered before this existed — resolve_role_id does exactly that for
    any tenant it encounters with no roles yet."""
    all_permissions = await ensure_permissions_seeded(db)
    existing_names = {r.name for r in await RoleRepository(db).list_for_tenant(tenant_id, 0, 1000)}

    if "Admin" not in existing_names:
        db.add(Role(
            tenant_id=tenant_id, name="Admin", permissions=all_permissions,
            description="Full access, same as the account owner.",
        ))
    if "Member" not in existing_names:
        member_perms = [p for p in all_permissions if p.resource not in _ADMIN_ONLY_RESOURCES]
        db.add(Role(
            tenant_id=tenant_id, name="Member", permissions=member_perms,
            description="Full access to day-to-day operations. Can't manage users, roles or tenant settings.",
        ))
    if "Viewer" not in existing_names:
        viewer_perms = [p for p in all_permissions if p.action == "read" and p.resource not in _ADMIN_ONLY_RESOURCES]
        db.add(Role(
            tenant_id=tenant_id, name="Viewer", permissions=viewer_perms,
            description="Read-only access across modules.",
        ))
    await db.flush()


async def resolve_role_id(db: AsyncSession, tenant_id: uuid.UUID, role_str: str) -> uuid.UUID | None:
    """Maps an invite's free-text role to a real, permission-bearing Role
    row's id. Seeds the tenant's default roles first if it has none yet, so
    this works even for tenants that registered before default roles existed
    — it's the single place both invite flows (admin_invite_user and the
    tenant self-service create_user) resolve a role into real access."""
    name = _ROLE_NAME_ALIASES.get(role_str.strip().lower(), "Member")
    role = await get_role_by_name(db, tenant_id, name)
    if role is None:
        await seed_default_roles(db, tenant_id)
        role = await get_role_by_name(db, tenant_id, name)
    return role.id if role else None
