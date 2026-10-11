"""Navigation: the assistant can take the user to existing Pesaa pages, but only through this registry.

The model never writes a URL. It picks a destination *key* (a closed list); the server checks that the tenant has
the module and the user has the permission, and returns the approved path. The client re-validates the path shape
before using its router. Add a page by adding one line to `DESTINATIONS` — nothing else changes.
"""
from dataclasses import dataclass
from typing import Any, Literal

from app.modules.ai.tools import ToolContext, ToolError, _Args, _result, tool
from app.modules.tenants.service.feature import feature_enabled


@dataclass(frozen=True)
class Destination:
    key: str
    label: str
    href: str
    module: str | None = None       # tenant feature that must be on
    permission: str | None = None   # resource:action the user must hold


_D = Destination
DESTINATIONS: dict[str, Destination] = {d.key: d for d in (
    _D("dashboard", "Dashboard", "/dashboard"),
    _D("sales", "Sales", "/sales", "sales", "orders:read"),
    _D("sales_orders", "Sales orders", "/sales/orders", "sales", "orders:read"),
    _D("sales_returns", "Sales returns", "/sales/returns", "sales", "orders:read"),
    _D("sales_targets", "Sales targets", "/sales/targets", "sales", "orders:read"),
    _D("sales_analytics", "Sales analytics", "/sales/analytics", "sales", "orders:read"),
    _D("pos", "Point of sale", "/pos", "sales", "orders:create"),
    _D("customers", "Customers", "/customers", "sales", "orders:read"),
    _D("customer_segments", "Customer segments", "/customers/segments", "sales", "orders:read"),
    _D("customer_loyalty", "Loyalty", "/customers/loyalty", "sales", "orders:read"),
    _D("inventory", "Inventory", "/inventory", "inventory", "stock:read"),
    _D("products", "Products", "/inventory/products", "inventory", "stock:read"),
    _D("categories", "Product categories", "/inventory/categories", "inventory", "stock:read"),
    _D("stock_transfers", "Stock transfers", "/inventory/transfers", "inventory", "stock:read"),
    _D("batches", "Batches", "/inventory/batches", "inventory", "stock:read"),
    _D("suppliers", "Suppliers", "/inventory/suppliers", "inventory", "stock:read"),
    _D("accounting", "Accounting", "/accounting", "accounting", "journal_entries:read"),
    _D("invoices", "Invoices", "/accounting/invoices", "accounting", "accounts_receivable:read"),
    _D("expenses", "Expenses", "/accounting/expenses", "accounting", "journal_entries:read"),
    _D("income", "Income", "/accounting/income", "accounting", "journal_entries:read"),
    _D("chart_of_accounts", "Chart of accounts", "/accounting/accounts", "accounting", "journal_entries:read"),
    _D("accounting_reports", "Accounting reports", "/accounting/reports", "accounting", "journal_entries:read"),
    _D("purchases", "Purchase orders", "/procurement/orders", "procurement", "purchase_orders:read"),
    _D("purchase_requests", "Purchase requests", "/procurement/requests", "procurement", "purchase_orders:read"),
    _D("purchase_returns", "Purchase returns", "/procurement/returns", "procurement", "purchase_orders:read"),
    _D("procurement", "Procurement", "/procurement", "procurement", "purchase_orders:read"),
    _D("hr", "HR", "/hr", "hr", "employees:read"),
    _D("attendance", "Attendance", "/hr/attendance", "hr", "attendance:read"),
    _D("leave", "Leave", "/hr/leave", "hr", "leave:read"),
    _D("payroll", "Payroll", "/hr/payroll", "hr", "payroll:read"),
    _D("manufacturing", "Manufacturing", "/manufacturing", "manufacturing", "work_orders:read"),
    _D("work_orders", "Work orders", "/manufacturing/work-orders", "manufacturing", "work_orders:read"),
    _D("bill_of_materials", "Bills of materials", "/manufacturing/bom", "manufacturing", "bom:read"),
    _D("services", "Services", "/services", "services", "services:read"),
    _D("appointments", "Appointments", "/services/appointments", "services", "appointments:read"),
    _D("reports", "Reports", "/reports", None, None),
    _D("settings", "Settings", "/settings"),
    _D("users", "Users and roles", "/settings/users", None, "users:read"),
    _D("branches", "Branches", "/settings/branches", None, "branches:read"),
)}

_KEYS = tuple(DESTINATIONS)
Dest = Literal[_KEYS]  # type: ignore[valid-type]


class NavArgs(_Args):
    destination: Dest  # type: ignore[valid-type]


@tool("navigate", "Take the user to a page in Pesaa (e.g. 'open customers', 'go to purchase orders', 'take me to accounting'). "
      "Use when the user asks to open, go to, show or switch to a page or module. Destinations: "
      + ", ".join(f"{d.key}={d.label}" for d in DESTINATIONS.values()) + ".",
      module=None, permission=None, args=NavArgs)
async def navigate(ctx: ToolContext, a: NavArgs) -> dict[str, Any]:
    d = DESTINATIONS.get(a.destination)
    if d is None:
        raise ToolError("I don't know that page.")
    if d.permission and not ctx.can(d.permission):
        raise ToolError(f"You don't have access to {d.label}.")
    if d.module and not await feature_enabled(ctx.db, ctx.tenant_id, d.module):
        raise ToolError(f"{d.label} isn't turned on for your business.")
    r = _result("navigate", f"Opening {d.label}.", ctx, how="Takes you to the page you asked for.", links=[])
    r["navigate"] = {"label": d.label, "href": d.href}
    return r
