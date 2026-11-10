"""Backend authorisation for ERP module routers.

The ERP module routers (inventory, sales, accounting, hr, procurement, crm, manufacturing, services, repairs) are already
gated by the tenant's subscription (`require_feature`). This adds the matching *permission* gate for every write
(POST / PUT / PATCH / DELETE): a signed-in business user may change data in a module only if their role grants a write
permission on one of that module's resources — the same module→resource map the sidebar uses, so what the UI hides the API
also refuses. A few sensitive endpoints need an exact permission (see EXACT).

- The business owner (`is_superuser` inside their tenant) and platform staff (no tenant) are not restricted here.
- Reads need some permission in the module (decide_read): a person whose role grants nothing there can't read it either.
- The frontend hides what a user can't use, but this is the security boundary."""
import re
from collections.abc import Awaitable, Callable, Iterable

from fastapi import Request

from app.core.deps import CurrentUser, may_delete
from app.core.exceptions import ForbiddenError
from app.core.logging import get_logger
from app.core.permission_policy import permissions_for_method

log = get_logger("access")

# Module → the permission resources that grant access to it. Keep in step with MODULE_RESOURCES in frontend/src/lib/auth.tsx.
MODULE_RESOURCES: dict[str, tuple[str, ...]] = {
    "sales": ("orders", "pos", "invoices", "returns", "pricing", "contacts", "accounts", "leads", "opportunities", "activities"),
    "pos": ("pos",),
    "discounts": ("discounts",),
    "inventory": ("items", "warehouses", "stock", "pricing", "returns"),
    "accounting": ("invoices", "chart_of_accounts", "journal_entries", "accounts_payable", "accounts_receivable", "banking", "fixed_assets",
                   "budgeting", "tax", "expenses", "payroll"),
    "expenses": ("expenses",),
    "debts": ("accounts_receivable", "accounts_payable"),
    "hr": ("employees", "organization", "recruitment", "attendance", "leave", "payroll", "performance"),
    "procurement": ("vendors", "requisitions", "rfq", "purchase_orders", "goods_receipt", "contracts", "accounts_payable"),
    "crm": ("leads", "accounts", "contacts", "opportunities", "activities", "campaigns", "tickets"),
    "manufacturing": ("bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing", "stock", "items"),
    "services": ("services", "appointments", "queue", "service_commissions"),
    "repairs": ("services", "orders", "items", "stock"),
}

# Business entitlements are shared; employee switches are independent.
MODULE_PARENTS = {"expenses": "accounting", "debts": "accounting"}
MODULE_LABELS = {"expenses": "Expenses", "debts": "Debt Management"}

# Which permission actions allow each HTTP method. POST is broad because many POSTs are actions (pay, receive, post, approve).
WRITE_ACTIONS: dict[str, frozenset[str]] = {
    "POST": frozenset({"create", "update", "approve"}),
    "PUT": frozenset({"update", "create"}),
    "PATCH": frozenset({"update"}),
    "DELETE": frozenset({"delete"}),
}

# Narrower resources for parts of a module (matched on the path after /api/v1/tenants), first match wins.
PATH_RESOURCES: list[tuple[re.Pattern[str], tuple[str, ...]]] = [
    (re.compile(r"^/sales/customers"), ("contacts", "accounts")),
    (re.compile(r"^/sales/deals"), ("opportunities",)),
]

# Exact permission(s) (any one of) for specific endpoints — evaluated before the coarse module rule.
EXACT: list[tuple[str, re.Pattern[str], tuple[str, ...]]] = [
    ("PATCH", re.compile(r"^/sales/discounts/settings$"), ("discounts:settings",)),
    ("POST", re.compile(r"^/sales/discounts/rules/[^/]+/status$"), ("discounts:activate",)),
    ("POST", re.compile(r"^/sales/discounts/campaigns"), ("discounts:promotions",)),
    ("PUT", re.compile(r"^/sales/discounts/campaigns/[^/]+$"), ("discounts:promotions",)),
    ("POST", re.compile(r"^/sales/discounts/coupons"), ("discounts:coupons",)),
    ("POST", re.compile(r"^/sales/discounts/approvals$"), ("discounts:apply",)),
    ("POST", re.compile(r"^/sales/discounts/rules$"), ("discounts:create",)),
    ("PUT", re.compile(r"^/sales/discounts/rules/[^/]+$"), ("discounts:update",)),
    ("POST", re.compile(r"^/sales/orders$"), ("orders:create", "pos:create")),
    ("POST", re.compile(r"^/sales/quotations$"), ("orders:create",)),
    ("POST", re.compile(r"^/sales/quotations/[^/]+/(send|accept|reject|convert)$"), ("orders:update",)),
    ("POST", re.compile(r"^/procurement/purchase-orders$"), ("purchase_orders:create",)),
    ("PATCH", re.compile(r"^/procurement/purchase-orders/[^/]+$"), ("purchase_orders:update",)),
    ("DELETE", re.compile(r"^/procurement/purchase-orders/[^/]+$"), ("purchase_orders:delete",)),
    ("POST", re.compile(r"^/procurement/purchase-orders/[^/]+/(receive|receipts|attachments)$"), ("purchase_orders:update",)),
    ("POST", re.compile(r"^/procurement/purchase-orders/[^/]+/actions/approve$"), ("purchase_orders:approve",)),
    ("POST", re.compile(r"^/procurement/purchase-orders/[^/]+/(cancel|actions/(submit|send|close))$"), ("purchase_orders:update",)),
    ("PATCH", re.compile(r"^/procurement/supplier-bills/[^/]+$"), ("accounts_payable:update",)),
    ("POST", re.compile(r"^/procurement/supplier-bills/[^/]+/payments$"), ("accounts_payable:create",)),
    ("POST", re.compile(r"^/procurement/purchase-returns/[^/]+/refund$"), ("accounts_payable:create",)),
    ("POST", re.compile(r"^/procurement/purchase-returns"), ("purchase_orders:update",)),
    ("DELETE", re.compile(r"^/procurement/purchase-returns"), ("purchase_orders:delete",)),
    ("POST", re.compile(r"^/sales/orders/[^/]+/void-request$"), ("orders:update",)),  # asking is open to anyone who can edit sales; deciding is not
    ("POST", re.compile(r"^/sales/customers(/bulk)?$"), ("contacts:create",)),
    ("PATCH", re.compile(r"^/sales/customers/[^/]+$"), ("contacts:update",)),
    ("DELETE", re.compile(r"^/sales/customers/[^/]+$"), ("contacts:delete",)),
    ("POST", re.compile(r"^/crm/contacts$"), ("contacts:create",)),
    ("PATCH", re.compile(r"^/crm/contacts/[^/]+$"), ("contacts:update",)),
    ("DELETE", re.compile(r"^/crm/contacts/[^/]+$"), ("contacts:delete",)),
    ("POST", re.compile(r"^/crm/opportunities$"), ("opportunities:create",)),
    ("PATCH", re.compile(r"^/crm/opportunities/[^/]+$"), ("opportunities:update",)),
    ("DELETE", re.compile(r"^/crm/opportunities/[^/]+$"), ("opportunities:delete",)),
    ("POST", re.compile(r"^/crm/activities$"), ("activities:create",)),
    ("PATCH", re.compile(r"^/crm/activities/[^/]+$"), ("activities:update",)),
    ("DELETE", re.compile(r"^/crm/activities/[^/]+$"), ("activities:delete",)),
    ("POST", re.compile(r"^/crm/campaigns$"), ("campaigns:create",)),
    ("PATCH", re.compile(r"^/crm/campaigns/[^/]+$"), ("campaigns:update",)),
    ("DELETE", re.compile(r"^/crm/campaigns/[^/]+$"), ("campaigns:delete",)),
    ("POST", re.compile(r"^/crm/emails$"), ("campaigns:create",)),
    ("PATCH", re.compile(r"^/crm/emails/[^/]+$"), ("campaigns:update",)),
    ("DELETE", re.compile(r"^/crm/emails/[^/]+$"), ("campaigns:delete",)),
]

# Lookups other modules' screens legitimately read (staff pickers, customer pickers, VAT rates at the till). A read of these paths is
# also allowed to people holding any permission in the listed resources, so hiding a module never breaks the screen that borrows from it.
READ_ALSO: list[tuple[re.Pattern[str], tuple[str, ...]]] = [
    (re.compile(r"^/hr/employees"), ("services", "appointments", "queue", "service_commissions", "orders", "pos")),
    (re.compile(r"^/sales/customers"), ("services", "appointments", "queue", "accounts_receivable", "accounts_payable", "repairs", "items")),
    (re.compile(r"^/accounting/tax/rates"), ("orders", "pos", "invoices", "items")),
    # The till and the sales screens read discount settings and prices to show a cart; only managing rules needs discounts permissions.
    (re.compile(r"^/sales/discounts"), ("pos", "orders", "pricing")),
]

# POSTs that only compute or look something up and change nothing.
READ_ONLY_POSTS = re.compile(r"(/calculate/|/search$|/preview$)")

_PREFIX = re.compile(r"^/api/v\d+/tenants")


def tenant_path(path: str) -> str:
    return _PREFIX.sub("", path) or "/"


def decide(module: str, method: str, path: str, permissions: Iterable[str]) -> tuple[bool, str]:
    """Pure rule: may a non-owner holding `permissions` perform `method path` in `module`? Returns (allowed, what's needed)."""
    method = method.upper()
    if method not in WRITE_ACTIONS or (method == "POST" and READ_ONLY_POSTS.search(path)):
        return True, ""
    held = set(permissions)
    for m, pattern, needed in EXACT:
        if m == method and pattern.match(path):
            return bool(held & set(needed)), " or ".join(needed)
    resources = next((r for p, r in PATH_RESOURCES if p.match(path)), MODULE_RESOURCES[module])
    actions = WRITE_ACTIONS[method]
    allowed = any(f"{r}:{a}" in held for r in resources for a in actions)
    return allowed, f"a {'/'.join(sorted(actions))} permission in {module}"


def decide_read(module: str, path: str, permissions: Iterable[str]) -> tuple[bool, str]:
    """May a non-owner holding `permissions` read `path` in `module`? They need some permission (any action) on one of the module's
    resources: the same test Access Management and the menu use, so what is hidden is also what the server refuses."""
    held = {p.split(":", 1)[0] for p in permissions}
    resources = set(MODULE_RESOURCES[module])
    for pattern, extra in READ_ALSO:
        if pattern.match(path):
            resources |= set(extra)
    return bool(held & resources), f"access to {module}"


def require_module_write(module: str) -> Callable[..., Awaitable[None]]:
    """Router-level dependency: refuses writes to `module` from users whose role grants no write permission there."""
    async def _check(request: Request, user: CurrentUser) -> None:
        if user.tenant_id is None or user.is_superuser or request.method == "OPTIONS":
            return
        path = tenant_path(request.url.path)
        child = module
        if module == "accounting":
            if path.rstrip("/") in ("/expense-management", "/accounting/expenses") or path.startswith(("/expense-management/", "/accounting/expenses/")):
                child = "expenses"
            elif path.rstrip("/") == "/debts" or path.startswith("/debts/"):
                child = "debts"
        if child in (getattr(user, "disabled_modules", None) or []):
            log.warning("access.feature_off", extra={"_extra_fields": {"user_id": str(user.id), "module": module, "path": request.url.path}})
            raise ForbiddenError("This feature has been switched off for your account. Ask an administrator of your business.")
        if request.method == "DELETE" and not may_delete(user):
            log.warning("access.delete_denied", extra={"_extra_fields": {"user_id": str(user.id), "module": module, "path": request.url.path}})
            raise ForbiddenError("Deleting is limited to business owners and administrators. Ask one of them to remove this.")
        # Administrators retain full access; member and job roles follow their grants.
        role = (user.role or "").lower()
        if role in ("admin", "owner"):
            return
        if request.method in ("GET", "HEAD"):
            allowed, needed = decide_read(module, tenant_path(request.url.path), user.permissions_names)
            if not allowed:
                log.warning("access.denied", extra={"_extra_fields": {"user_id": str(user.id), "module": module, "method": request.method, "path": request.url.path}})
                raise ForbiddenError(f"You don't have access to this. Ask an administrator for {needed}.")
            return
        allowed, needed = decide(module, request.method, tenant_path(request.url.path),
                                 permissions_for_method(request.method, user.permissions_names, getattr(user, "role_permissions_names", user.permissions_names), path=tenant_path(request.url.path)))
        if not allowed:
            log.warning("access.denied", extra={"_extra_fields": {"user_id": str(user.id), "module": module, "method": request.method, "path": request.url.path}})
            raise ForbiddenError(f"You don't have permission to do this. Ask an administrator for {needed}.")
    return _check
