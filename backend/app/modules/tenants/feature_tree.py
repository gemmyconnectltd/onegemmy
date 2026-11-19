"""Submodules and features inside each module, and the routes each feature covers.

A module (``feature_flags``) is what plans sell and what a business switches on. Inside it, optional capabilities can be
switched off on their own, by Pesaa for every business or for one business, without touching the module or any data.
Only optional capabilities are listed: a module's core screens (products, sales orders, journal) go with the module.

Paths are matched on the path after ``/api/v1/tenants`` at a segment boundary. A switched-off feature stays readable,
so history can always be reconciled; it only refuses new writes. The migration that creates ``module_features`` seeds
these same rows; a key added here later needs a migration that inserts its row (until then it counts as on).
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Node:
    key: str
    module: str
    name: str
    description: str
    parent: str | None = None  # a submodule key
    paths: tuple[str, ...] = ()  # only features carry routes; a submodule switches all of its features

    @property
    def level(self) -> str:
        return "feature" if self.paths else "submodule"


TREE: tuple[Node, ...] = (
    Node("inventory.stock_control", "inventory", "Stock control", "Moving and counting stock"),
    Node("inventory.transfers", "inventory", "Stock transfers", "Move stock between warehouses and branches",
         "inventory.stock_control", ("/inventory/transfers",)),
    Node("inventory.stock_counts", "inventory", "Stock counts", "Count stock and post the differences",
         "inventory.stock_control", ("/inventory/stock-counts",)),
    Node("inventory.traceability", "inventory", "Traceability", "Follow individual units and lots"),
    Node("inventory.batches", "inventory", "Batch tracking", "Lots with expiry dates",
         "inventory.traceability", ("/inventory/batches",)),
    Node("inventory.serials", "inventory", "Serial numbers", "Track each unit by its serial number",
         "inventory.traceability", ("/inventory/serials",)),
    Node("inventory.warranty", "inventory", "Warranty", "Warranty records for sold units",
         "inventory.traceability", ("/inventory/warranty",)),
    Node("inventory.catalogue_extras", "inventory", "Catalogue extras", "Optional product catalogue tools"),
    Node("inventory.brands", "inventory", "Brands", "Group products by brand",
         "inventory.catalogue_extras", ("/inventory/brands",)),
    Node("inventory.markdowns", "inventory", "Markdowns", "Reduce prices of slow or damaged stock",
         "inventory.catalogue_extras", ("/inventory/markdowns",)),
    Node("sales.quotations", "sales", "Quotations", "Send quotations and convert them to sales",
         paths=("/sales/quotations",)),
    Node("sales.returns", "sales", "Sales returns", "Take back sold items and refund", paths=("/sales/returns",)),
    Node("sales.targets", "sales", "Sales targets", "Targets for the team and each seller", paths=("/sales/targets",)),
    Node("sales.deals", "sales", "Deals", "Track deals before they become sales", paths=("/sales/deals",)),
    Node("procurement.requisitions", "procurement", "Purchase requests", "Staff request what should be bought",
         paths=("/procurement/requisitions",)),
    Node("procurement.supplier_bills", "procurement", "Supplier bills", "Record and pay supplier bills",
         paths=("/procurement/supplier-bills",)),
    Node("procurement.purchase_returns", "procurement", "Purchase returns", "Send goods back to suppliers",
         paths=("/procurement/purchase-returns",)),
    Node("accounting.budgets", "accounting", "Budgets", "Plan spending and compare it with actuals",
         paths=("/accounting/budgets",)),
    Node("hr.attendance", "hr", "Attendance", "Clock-in records and timesheets", paths=("/hr/attendance",)),
    Node("hr.leave", "hr", "Leave", "Leave requests and balances", paths=("/hr/leave",)),
    Node("hr.payroll", "hr", "Payroll", "Pay runs and payslips", paths=("/hr/payroll",)),
    Node("hr.recruitment", "hr", "Recruitment", "Applicants and hiring", paths=("/hr/applicants",)),
    Node("crm.campaigns", "crm", "Campaigns", "Customer campaigns and emails", paths=("/crm/campaigns", "/crm/emails")),
    # Parts added with the full feature controls (migration f1b7d2e9a405). Expenses and Debt Management are served by the
    # accounting router, so their parts sit under the accounting module.
    Node("accounting.recurring_expenses", "accounting", "Recurring expenses", "Expenses that repeat on a schedule",
         paths=("/expense-management/recurring",)),
    Node("accounting.debt_reminders", "accounting", "Debt reminders & statements", "Remind customers and send statements",
         paths=("/debts/receivable/remind", "/debts/receivable/statement")),
    Node("services.staff_commissions", "services", "Staff commissions", "Commission for staff who deliver services",
         paths=("/services/staff-commissions",)),
    Node("manufacturing.boms", "manufacturing", "Bills of materials", "What each product is made of",
         paths=("/manufacturing/boms",)),
    Node("manufacturing.work_orders", "manufacturing", "Work orders", "Produce goods from a bill of materials",
         paths=("/manufacturing/orders",)),
    Node("discounts.coupons", "discounts", "Coupons", "Coupon codes customers can use", paths=("/sales/discounts/coupons",)),
    Node("discounts.campaigns", "discounts", "Promotions", "Time-limited promotional campaigns",
         paths=("/sales/discounts/campaigns",)),
    Node("discounts.approvals", "discounts", "Discount approvals", "Ask a manager to approve a discount",
         paths=("/sales/discounts/approvals",)),
)

# A part that cannot work while another one is off: it stops taking changes too, and the controls warn first.
PART_DEPENDENCIES: dict[str, tuple[str, ...]] = {
    "inventory.warranty": ("inventory.serials",),  # warranty is recorded against serial numbers
    "manufacturing.work_orders": ("manufacturing.boms",),  # a work order produces from a bill of materials
    "procurement.purchase_returns": ("procurement.supplier_bills",),  # refunds settle against the supplier's bill
}


def part_dependents(key: str) -> list[str]:
    return sorted(k for k, needs in PART_DEPENDENCIES.items() if key in needs)

BY_KEY: dict[str, Node] = {n.key: n for n in TREE}


def chain(key: str) -> list[str]:
    """The feature and every submodule above it, innermost first."""
    out: list[str] = []
    node = BY_KEY.get(key)
    while node is not None:
        out.append(node.key)
        node = BY_KEY.get(node.parent) if node.parent else None
    return out


def feature_for_path(module: str, path: str) -> str | None:
    """The feature of ``module`` that covers ``path`` (already stripped of /api/v1/tenants), if any."""
    path = path.rstrip("/") or "/"
    for node in TREE:
        if node.module == module and any(path == p or path.startswith(p + "/") for p in node.paths):
            return node.key
    return None


def descendants(key: str) -> list[str]:
    return [n.key for n in TREE if n.parent == key]
