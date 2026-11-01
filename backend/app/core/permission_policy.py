"""Business-wide operational view/edit policy; sensitive actions remain role-based."""
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


def effective_permissions(assigned: Iterable[str], *, business_user: bool) -> list[str]:
    """Never broaden platform, inactive or anonymous accounts through the business policy."""
    return sorted(set(assigned) | (OPERATIONAL_VIEW_EDIT if business_user else frozenset()))


def permissions_for_method(method: str, effective: Iterable[str], assigned: Iterable[str]) -> list[str]:
    # POST module gates accept update as well as create. Do not let baseline update
    # grants accidentally authorize creating records, payments or approval actions.
    return list(assigned if method.upper() == "POST" else effective)
