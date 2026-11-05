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
    # ── Sales and customers ──
    "Sales Manager": ("Runs sales: orders, returns approval, pricing, customers and the pipeline. No finance books, no HR.", {
        "orders": (*_CRUD, "approve"), "pos": _CRUD, "invoices": _CRUD, "returns": (*_CRUD, "approve"), "pricing": ("read", "update"),
        "items": ("read",), "stock": ("read",), "contacts": _CRUD, "accounts": _CRUD, "leads": _CRUD, "opportunities": (*_CRUD, "approve"),
        "activities": _CRUD, "campaigns": _CRUD, "tickets": ("read",), "accounts_receivable": ("read",),
    }),
    "Sales Representative": ("Sells and looks after customers and their leads. Can't approve, price or see finance.", {
        "orders": _CRUD, "pos": _CRUD, "invoices": ("read",), "returns": ("read",), "pricing": ("read",), "items": ("read",), "stock": ("read",),
        "contacts": _CRUD, "leads": _CRUD, "opportunities": _CRUD, "activities": _CRUD,
    }),
    "Marketing Officer": ("Runs campaigns and keeps customer and lead records. No sales processing or finance.", {
        "campaigns": _CRUD, "contacts": _CRUD, "leads": _CRUD, "activities": _CRUD, "opportunities": ("read",), "orders": ("read",), "items": ("read",),
    }),
    # ── Purchasing and stock ──
    "Purchasing Officer": ("Raises requests and purchase orders and receives goods. Can't approve orders or see finance.", {
        "vendors": _CRUD, "requisitions": _CRUD, "rfq": _CRUD, "purchase_orders": _CRUD, "goods_receipt": _CRUD, "contracts": ("read",),
        "items": ("read",), "stock": ("read",), "warehouses": ("read",), "accounts_payable": ("read",),
    }),
    "Purchasing Manager": ("Approves purchases and manages suppliers and contracts. Can see what is payable.", {
        "vendors": (*_CRUD, "approve"), "requisitions": (*_CRUD, "approve"), "rfq": (*_CRUD, "approve"), "purchase_orders": (*_CRUD, "approve"),
        "goods_receipt": _CRUD, "contracts": (*_CRUD, "approve"), "items": ("read",), "stock": ("read",), "warehouses": ("read",), "accounts_payable": ("read",),
    }),
    "Warehouse Keeper": ("Receives, counts, moves and adjusts stock. Can't see prices of sales or finance.", {
        "stock": _CRUD, "warehouses": _CRUD, "goods_receipt": _CRUD, "items": ("read", "update"), "returns": ("read",), "purchase_orders": ("read",),
    }),
    # ── Finance ──
    "Finance Manager": ("Leads finance: all accounting, banking, budgets and tax, with approval of entries, expenses and payments. No HR or user management.", {
        "chart_of_accounts": (*_CRUD, "approve"), "journal_entries": (*_CRUD, "approve"), "accounts_payable": (*_CRUD, "approve"), "accounts_receivable": (*_CRUD, "approve"),
        "banking": (*_CRUD, "approve"), "fixed_assets": (*_CRUD, "approve"), "budgeting": (*_CRUD, "approve"), "expenses": (*_CRUD, "approve"), "tax": (*_CRUD, "approve"),
        "invoices": _CRUD, "orders": ("read",), "items": ("read",), "contacts": ("read",), "vendors": ("read",), "purchase_orders": ("read",), "payroll": ("read",),
    }),
    "Auditor": ("Read-only view of the books, expenses, sales, purchases and stock, to check them. Changes nothing.", {
        "chart_of_accounts": ("read",), "journal_entries": ("read",), "accounts_payable": ("read",), "accounts_receivable": ("read",), "banking": ("read",),
        "fixed_assets": ("read",), "budgeting": ("read",), "expenses": ("read",), "tax": ("read",), "invoices": ("read",), "orders": ("read",), "returns": ("read",),
        "purchase_orders": ("read",), "goods_receipt": ("read",), "items": ("read",), "stock": ("read",), "payroll": ("read",),
    }),
    # ── People ──
    "HR Manager": ("Leads HR: employees, recruitment, attendance, leave approval, performance and payroll. No finance books.", {
        "employees": (*_CRUD, "approve"), "organization": _CRUD, "departments": _CRUD, "recruitment": (*_CRUD, "approve"), "attendance": (*_CRUD, "approve"),
        "leave": (*_CRUD, "approve"), "payroll": (*_CRUD, "approve"), "performance": (*_CRUD, "approve"), "expenses": ("read",),
    }),
    "HR Officer": ("Keeps employee, attendance and leave records and runs recruitment. Can't approve or see payroll.", {
        "employees": _CRUD, "departments": ("read",), "recruitment": _CRUD, "attendance": _CRUD, "leave": _CRUD, "performance": ("read",), "organization": ("read",),
    }),
    "Payroll Officer": ("Prepares payroll from employee and attendance records. Can't approve payroll.", {
        "payroll": _CRUD, "employees": ("read",), "attendance": ("read",), "leave": ("read",), "expenses": ("read",),
    }),
    # ── Production and service ──
    "Production Supervisor": ("Runs the shop floor: bills of materials, routings, work orders, quality and material planning. Can see stock.", {
        "bom": _CRUD, "routing": _CRUD, "mrp": _CRUD, "work_orders": (*_CRUD, "approve"), "shop_floor": _CRUD, "quality": _CRUD, "costing": ("read",),
        "items": ("read",), "stock": ("read",), "warehouses": ("read",),
    }),
    "Customer Support Agent": ("Handles customer tickets and looks up orders and customers. Can't change sales or finance.", {
        "tickets": _CRUD, "contacts": ("create", "read", "update"), "activities": _CRUD, "orders": ("read",), "invoices": ("read",), "returns": ("read",), "services": ("read",), "appointments": ("read",),
    }),
    "Service Technician": ("Does the service work: sees appointments and the queue and records the jobs. No sales or finance.", {
        "services": _CRUD, "appointments": ("read", "update"), "queue": ("read", "update"), "service_commissions": ("read",), "contacts": ("read",), "items": ("read",),
    }),
    "Receptionist": ("Books appointments, runs the walk-in queue and registers customers. No sales processing or finance.", {
        "appointments": _CRUD, "queue": _CRUD, "contacts": _CRUD, "services": ("read",),
    }),
    # ── Retail and sales ──
    "Store Manager": ("Runs one store: sales, returns, stock and receiving, and the staff on the till. No finance books or HR.", {
        "orders": (*_CRUD, "approve"), "pos": _CRUD, "invoices": ("read",), "returns": (*_CRUD, "approve"), "pricing": ("read",), "items": ("read",),
        "stock": _CRUD, "warehouses": ("read",), "goods_receipt": _CRUD, "contacts": _CRUD, "requisitions": ("create", "read"),
    }),
    "Cashier Supervisor": ("Supervises the tills: cashiers' sales, refunds and day-end checks. Approves returns and refunds.", {
        "pos": _CRUD, "orders": _CRUD, "returns": (*_CRUD, "approve"), "invoices": ("read",), "items": ("read",), "stock": ("read",), "contacts": _CRUD,
    }),
    "Sales Supervisor": ("Supervises the sales team and its orders, quotes and pipeline. Doesn't approve returns or change prices.", {
        "orders": _CRUD, "pos": ("read",), "invoices": _CRUD, "returns": ("read",), "pricing": ("read",), "items": ("read",), "stock": ("read",),
        "contacts": _CRUD, "leads": _CRUD, "opportunities": _CRUD, "activities": _CRUD,
    }),
    "Sales Approver": ("Reviews and approves or rejects sales before they are paid, and corrects who is credited with a sale. Cannot enter sales, change prices or see finance.", {
        "orders": ("read", "update", "approve"), "invoices": ("read",), "returns": ("read",), "pricing": ("read",), "items": ("read",), "stock": ("read",),
        "contacts": ("read",),
    }),
    "Sales Operations Officer": ("Follows sales orders through fulfilment and customer follow-up. No pricing or approvals.", {
        "orders": _CRUD, "invoices": ("create", "read", "update"), "returns": ("create", "read"), "contacts": ("read", "update"), "items": ("read",), "stock": ("read",), "activities": _CRUD,
    }),
    # ── Inventory and warehouse ──
    "Warehouse Manager": ("Runs a warehouse: receiving, transfers, stock and its staff. Approves stock movements; no finance.", {
        "warehouses": (*_CRUD, "approve"), "stock": (*_CRUD, "approve"), "goods_receipt": (*_CRUD, "approve"), "items": ("read", "update"),
        "returns": ("read",), "purchase_orders": ("read",), "requisitions": ("read",),
    }),
    "Inventory Manager": ("Owns inventory control: products, stock policy, counts and adjustments. Approves stock changes; no finance.", {
        "items": (*_CRUD, "approve"), "stock": (*_CRUD, "approve"), "warehouses": _CRUD, "pricing": ("read", "update"), "goods_receipt": ("read",),
        "purchase_orders": ("read",), "returns": ("read",),
    }),
    "Stock Controller": ("Watches stock accuracy, movements and discrepancies and raises adjustments for approval.", {
        "stock": _CRUD, "items": ("read",), "warehouses": ("read",), "goods_receipt": ("read",), "returns": ("read",),
    }),
    "Stock Counter": ("Counts stock on the shelf and submits what differs. Can't approve adjustments.", {
        "stock": ("create", "read"), "items": ("read",), "warehouses": ("read",),
    }),
    "Delivery / Dispatch Officer": ("Prepares dispatches and records hand-over and delivery status.", {
        "orders": ("read", "update"), "invoices": ("read",), "stock": ("read",), "warehouses": ("read",), "contacts": ("read",), "returns": ("read",),
    }),
    # ── Finance and accounting ──
    "Accounts Receivable Officer": ("Manages what customers owe: invoices, payments and collections. Doesn't post journals or approve.", {
        "accounts_receivable": _CRUD, "invoices": _CRUD, "orders": ("read",), "contacts": ("read", "update"), "banking": ("read",), "credit": ("read",),
    }),
    "Accounts Payable Officer": ("Manages what the business owes suppliers: bills and payment preparation. Doesn't approve payments.", {
        "accounts_payable": _CRUD, "vendors": ("read",), "purchase_orders": ("read",), "goods_receipt": ("read",), "expenses": ("read",), "banking": ("read",),
    }),
    "Expense Officer": ("Records and classifies expenses and submits them. Can't approve them.", {
        "expenses": _CRUD, "vendors": ("read",), "chart_of_accounts": ("read",),
    }),
    "Credit Controller": ("Watches credit limits and overdue balances and decides credit requests.", {
        "credit": ("read", "update", "approve"), "accounts_receivable": ("read", "update"), "orders": ("read",), "contacts": ("read", "update"), "invoices": ("read",),
    }),
    "Treasury Officer": ("Handles cash and bank records within the accounts they are given. Transfers still need a finance approver.", {
        "banking": _CRUD, "chart_of_accounts": ("read",), "accounts_receivable": ("read",), "accounts_payable": ("read",), "expenses": ("read",),
    }),
    "Tax Officer": ("Prepares and reviews tax records and reports. No journals or payments.", {
        "tax": _CRUD, "invoices": ("read",), "orders": ("read",), "expenses": ("read",), "chart_of_accounts": ("read",), "journal_entries": ("read",),
    }),
    "Financial Controller": ("Oversees accounting controls: reviews and approves journals, reconciliations, budgets and expenses. Doesn't enter daily transactions.", {
        "chart_of_accounts": ("read", "update", "approve"), "journal_entries": ("read", "approve"), "banking": ("read", "approve"), "budgeting": ("read", "approve"),
        "expenses": ("read", "approve"), "accounts_payable": ("read",), "accounts_receivable": ("read",), "fixed_assets": ("read",), "tax": ("read",), "payroll": ("read",),
    }),
    # ── Procurement ──
    "Procurement Assistant": ("Prepares purchase requests, quotations and supplier records. Can't approve.", {
        "requisitions": _CRUD, "rfq": _CRUD, "vendors": _CRUD, "purchase_orders": ("create", "read"), "items": ("read",), "stock": ("read",),
    }),
    # ── Human resources ──
    "Recruitment Officer": ("Manages candidates and the hiring workflow. Can't see payroll.", {
        "recruitment": _CRUD, "employees": ("read",), "departments": ("read",),
    }),
    "Attendance Officer": ("Keeps attendance records and corrections. Can't approve leave or see payroll.", {
        "attendance": _CRUD, "employees": ("read",), "leave": ("read",), "departments": ("read",),
    }),
    # ── Manufacturing ──
    "Production Manager": ("Plans and runs production: bills of materials, routings, material planning and work orders. Approves production.", {
        "bom": (*_CRUD, "approve"), "routing": _CRUD, "mrp": _CRUD, "work_orders": (*_CRUD, "approve"), "shop_floor": _CRUD, "quality": ("read", "approve"),
        "costing": ("read", "update"), "items": ("read",), "stock": ("read",), "warehouses": ("read",),
    }),
    "Quality Control Officer": ("Records inspections, defects and quality decisions.", {
        "quality": _CRUD, "work_orders": ("read",), "shop_floor": ("read",), "bom": ("read",), "items": ("read",),
    }),
    "Machine Operator": ("Sees the assigned production tasks and records progress on the shop floor.", {
        "work_orders": ("read", "update"), "shop_floor": _CRUD, "bom": ("read",),
    }),
    # ── Services ──
    "Service Manager": ("Runs the service business: assignments, appointments, the queue and completion. Approves service work.", {
        "services": (*_CRUD, "approve"), "appointments": _CRUD, "queue": _CRUD, "service_commissions": ("read",), "contacts": _CRUD, "orders": ("read",), "invoices": ("read",),
    }),
    "Service Advisor": ("Registers service requests and talks to customers. Can't approve or see commissions' payment.", {
        "services": _CRUD, "appointments": _CRUD, "queue": _CRUD, "contacts": _CRUD, "orders": ("read",), "service_commissions": ("read",),
    }),
    # ── CRM ──
    "CRM Manager": ("Runs CRM: leads, opportunities, campaigns, customer activities and tickets.", {
        "leads": (*_CRUD, "approve"), "opportunities": (*_CRUD, "approve"), "activities": _CRUD, "campaigns": (*_CRUD, "approve"), "contacts": _CRUD,
        "accounts": _CRUD, "tickets": _CRUD, "orders": ("read",),
    }),
    "Customer Success Manager": ("Looks after customer relationships and follow-up. Can see their orders, invoices and balances.", {
        "contacts": _CRUD, "accounts": _CRUD, "activities": _CRUD, "tickets": _CRUD, "opportunities": ("read", "update"), "orders": ("read",),
        "invoices": ("read",), "accounts_receivable": ("read",), "returns": ("read",),
    }),
    # ── Administration, IT and compliance ──
    "Operations Manager": ("Coordinates operations across sales, stock, purchasing and production. Approves operational requests; no finance books, HR or user management.", {
        "orders": ("read", "update", "approve"), "returns": ("read", "approve"), "stock": ("read", "approve"), "purchase_orders": ("read", "approve"),
        "requisitions": ("read", "approve"), "work_orders": ("read", "approve"), "items": ("read",), "warehouses": ("read",), "goods_receipt": ("read",),
        "contacts": ("read",), "services": ("read",), "tickets": ("read",),
    }),
    "Compliance Officer": ("Reviews records, policies and exceptions across the business. Read-only.", {
        "chart_of_accounts": ("read",), "journal_entries": ("read",), "banking": ("read",), "expenses": ("read",), "tax": ("read",), "accounts_payable": ("read",),
        "accounts_receivable": ("read",), "orders": ("read",), "returns": ("read",), "purchase_orders": ("read",), "stock": ("read",), "items": ("read",),
        "employees": ("read",), "attendance": ("read",), "leave": ("read",), "payroll": ("read",), "tickets": ("read",),
    }),
    "IT Administrator": ("Supports users and technical issues: sees the team and handles support tickets. Can't change roles, passwords or settings; that stays with owners.", {
        "users": ("read",), "branches": ("read",), "departments": ("read",), "tickets": _CRUD, "activities": ("read",),
    }),
}

# Where each role sits in the role pickers (Team & Access). Departments are for organising; they grant nothing.
ROLE_DEPARTMENTS: dict[str, str] = {
    **dict.fromkeys(["Admin", "Owner/CEO", "General Manager", "Branch Manager", "Member", "Viewer", "Operations Manager"], "Administration"),
    **dict.fromkeys(["Cashier", "Cashier Supervisor", "Store Manager", "Sales Manager", "Sales Supervisor", "Sales Approver", "Sales Representative", "Sales Operations Officer"], "Sales & Retail"),
    **dict.fromkeys(["Inventory Officer", "Inventory Manager", "Warehouse Manager", "Warehouse Keeper", "Stock Controller", "Stock Counter", "Delivery / Dispatch Officer"], "Inventory & Warehouse"),
    **dict.fromkeys(["Accountant", "Finance Manager", "Financial Controller", "Accounts Receivable Officer", "Accounts Payable Officer", "Expense Officer", "Credit Controller", "Treasury Officer", "Tax Officer"], "Finance & Accounting"),
    **dict.fromkeys(["Purchasing Officer", "Purchasing Manager", "Procurement Assistant"], "Purchasing"),
    **dict.fromkeys(["HR Manager", "HR Officer", "Payroll Officer", "Recruitment Officer", "Attendance Officer"], "Human Resources"),
    **dict.fromkeys(["Factory Manager", "Production Manager", "Production Supervisor", "Quality Control Officer", "Machine Operator"], "Manufacturing"),
    **dict.fromkeys(["Service Manager", "Service Advisor", "Service Technician", "Receptionist"], "Services"),
    **dict.fromkeys(["CRM Manager", "Customer Success Manager", "Customer Support Agent", "Marketing Officer"], "CRM"),
    **dict.fromkeys(["Auditor", "Compliance Officer", "IT Administrator"], "IT & Compliance"),
}

# The roles every business is given. They can be tuned (permissions) but never renamed or deleted.
SYSTEM_ROLES = frozenset({"Admin", "Member", "Viewer", "Owner/CEO", "General Manager", "Branch Manager", "Factory Manager", *FOCUSED_ROLES})

_ROLE_NAME_ALIASES = {**{name.lower(): name for name in FOCUSED_ROLES}, "storekeeper": "Warehouse Keeper", "procurement manager": "Purchasing Manager", "admin": "Admin", "owner": "Admin", "member": "Member", "viewer": "Viewer",
                      "owner/ceo": "Owner/CEO", "general manager": "General Manager",
                      "branch manager": "Branch Manager", "factory manager": "Factory Manager"}


def default_role_permissions(permissions: list[Permission]) -> dict[str, list[Permission]]:
    """One source for seeding and explicitly restoring built-in role grants."""
    operational = [p for p in permissions if p.resource not in _ADMIN_ONLY_RESOURCES]
    templates = {
        "Admin": permissions,
        "Member": [p for p in operational if p.action in {"create", "read", "update"}],
        "Viewer": [p for p in operational if p.action == "read"],
        "Owner/CEO": permissions,
        "General Manager": [p for p in permissions if p.resource not in {"roles", "permissions", "billing", "tenants"}],
        "Branch Manager": [p for p in operational if p.resource not in {"bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing", "branches"}],
        "Factory Manager": [p for p in permissions if p.resource in {"bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing", "stock", "items", "warehouses"}],
    }
    for name, (_, grants) in FOCUSED_ROLES.items():
        templates[name] = [p for p in permissions if p.action in grants.get(p.resource, ())]
    return templates


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


def _read(role: Role) -> RoleRead:
    read = RoleRead.model_validate(role)
    read.built_in = role.name in SYSTEM_ROLES
    read.department = ROLE_DEPARTMENTS.get(role.name) or ("Custom" if not read.built_in else None)
    return read


async def list_roles(db: AsyncSession, tenant_id: uuid.UUID, offset: int, limit: int) -> list[RoleRead]:
    roles = await RoleRepository(db).list_for_tenant(tenant_id, offset, limit)
    return [_read(r) for r in roles]


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

    descriptions = {
        "Admin": "Full access, same as the account owner.",
        "Member": "Day-to-day work: create, view and edit records. Can't delete or approve, or manage users, roles or settings.",
        "Viewer": "Read-only access across modules.",
        **{name: description for name, (description, _) in FOCUSED_ROLES.items()},
    }
    for name, permissions in default_role_permissions(all_permissions).items():
        if name not in existing:
            db.add(Role(tenant_id=tenant_id, name=name, permissions=permissions,
                        description=descriptions.get(name, "Configurable business role template; branch assignments are managed separately.")))
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
