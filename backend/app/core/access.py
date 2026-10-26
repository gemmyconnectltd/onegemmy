"""Backend authorisation for ERP module routers.

The ERP module routers (inventory, sales, accounting, hr, procurement, crm, manufacturing, services, repairs) are already
gated by the tenant's subscription (`require_feature`). This adds the matching *permission* gate for every write
(POST / PUT / PATCH / DELETE): a signed-in business user may change data in a module only if their role grants a write
permission on one of that module's resources — the same module→resource map the sidebar uses, so what the UI hides the API
also refuses. A few sensitive endpoints need an exact permission (see EXACT).

- The business owner (`is_superuser` inside their tenant) and platform staff (no tenant) are not restricted here.
- Reads are not gated by this dependency; they are covered by the dashboard / read-scope work.
- The frontend hides what a user can't use, but this is the security boundary."""
import re
from collections.abc import Awaitable, Callable, Iterable

from fastapi import Request

from app.core.deps import CurrentUser
from app.core.exceptions import ForbiddenError
from app.core.logging import get_logger

log = get_logger("access")

# Module → the permission resources that grant access to it. Keep in step with MODULE_RESOURCES in frontend/src/lib/auth.tsx.
MODULE_RESOURCES: dict[str, tuple[str, ...]] = {
    "sales": ("orders", "pos", "invoices", "returns", "pricing", "contacts", "accounts", "leads", "opportunities", "activities"),
    "inventory": ("items", "warehouses", "stock", "pricing", "returns"),
    "accounting": ("invoices", "chart_of_accounts", "journal_entries", "accounts_payable", "accounts_receivable", "banking", "fixed_assets",
                   "budgeting", "tax", "expenses", "payroll"),
    "hr": ("employees", "organization", "recruitment", "attendance", "leave", "payroll", "performance"),
    "procurement": ("vendors", "requisitions", "rfq", "purchase_orders", "goods_receipt", "contracts", "accounts_payable"),
    "crm": ("leads", "accounts", "contacts", "opportunities", "activities", "campaigns", "tickets"),
    "manufacturing": ("bom", "routing", "mrp", "work_orders", "shop_floor", "quality", "costing", "stock", "items"),
    "services": ("services", "appointments", "queue", "service_commissions"),
    "repairs": ("services", "orders", "items", "stock"),
}

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
    ("POST", re.compile(r"^/sales/customers(/bulk)?$"), ("contacts:create",)),
    ("PATCH", re.compile(r"^/sales/customers/[^/]+$"), ("contacts:update",)),
    ("DELETE", re.compile(r"^/sales/customers/[^/]+$"), ("contacts:delete",)),
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


def require_module_write(module: str) -> Callable[..., Awaitable[None]]:
    """Router-level dependency: refuses writes to `module` from users whose role grants no write permission there."""
    async def _check(request: Request, user: CurrentUser) -> None:
        if request.method in ("GET", "HEAD", "OPTIONS") or user.tenant_id is None or user.is_superuser:
            return
        allowed, needed = decide(module, request.method, tenant_path(request.url.path), user.permissions_names)
        if not allowed:
            log.warning("access.denied", extra={"_extra_fields": {"user_id": str(user.id), "module": module, "method": request.method, "path": request.url.path}})
            raise ForbiddenError(f"You don't have permission to do this. Ask an administrator for {needed}.")
    return _check
