"""Business operational view/edit and checkout policy; sensitive actions stay role-based."""
from collections.abc import Iterable

OPERATIONAL_RESOURCES = frozenset({
    "items", "warehouses", "stock", "orders", "pricing", "returns", "invoices", "pos",
    "chart_of_accounts", "journal_entries", "accounts_payable", "accounts_receivable",
    "banking", "fixed_assets", "budgeting", "expenses", "tax", "employees", "organization",
    "departments", "recruitment", "attendance", "leave", "payroll", "performance", "vendors", "requisitions",
    "rfq", "purchase_orders", "goods_receipt", "contracts", "leads", "accounts", "contacts",
    "opportunities", "activities", "campaigns", "tickets", "bom", "routing", "mrp",
    "work_orders", "shop_floor", "quality", "costing", "services", "appointments", "queue",
    "service_commissions",
})
OPERATIONAL_VIEW_EDIT = frozenset(
    f"{resource}:{action}" for resource in OPERATIONAL_RESOURCES for action in ("read", "update")
)

# Taking a sale includes adding the buyer: a till user may add one customer (not import many, not edit or delete others).
CHECKOUT_CREATION = frozenset({"pos:create", "orders:create", "contacts:create"})


def effective_permissions(assigned: Iterable[str], *, business_user: bool) -> list[str]:
    """Never broaden platform, inactive or anonymous accounts through the business policy."""
    return sorted(set(assigned) | ((OPERATIONAL_VIEW_EDIT | CHECKOUT_CREATION) if business_user else frozenset()))


def permissions_for_method(
    method: str, effective: Iterable[str], assigned: Iterable[str], *, path: str = "",
) -> list[str]:
    # A POS charge creates one sale. Other POST actions (imports, refunds,
    # payments, approvals) still need explicit role grants at the module gate.
    if method.upper() != "POST":
        return list(effective)
    held = set(assigned)
    if path.rstrip("/") == "/sales/orders":
        held.update(set(effective) & {"pos:create", "orders:create"})
    elif path.rstrip("/").endswith("/void-request") and path.startswith("/sales/orders/"):
        held.update(set(effective) & {"orders:update"})
    elif path.rstrip("/") == "/sales/quotations":
        held.update(set(effective) & {"orders:create"})
    elif path.startswith("/sales/quotations/"):
        held.update(set(effective) & {"orders:update"})
    elif path.rstrip("/") == "/sales/customers":
        held.update(set(effective) & {"contacts:create"})
    return sorted(held)
