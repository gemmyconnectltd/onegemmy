"""The modules Data Management can show, the columns and filters of each, and which operations each one really supports.

Everything here is read from the real models. A module that only lists its records says so, and every unsupported operation carries the
reason and what to do instead, so the screen never offers something the backend cannot do safely.
"""
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import Select, func, select

from app.modules.accounting.models.debt import ManualDebt
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.models.transaction import Transaction
from app.modules.hr.models.employee import Employee
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.supplier import Supplier
from app.modules.inventory.models.transfer import StockTransfer
from app.modules.inventory.models.warehouse import StockMovement, Warehouse
from app.modules.manufacturing.models.production_order import ProductionOrder
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.services.models.service import Service
from app.modules.tenants.models import Branch, User

OPS = ("archive", "delete", "clean_test", "correct", "reset")
OP_LABEL = {"archive": "Archive records", "delete": "Delete eligible records", "clean_test": "Clean test data", "correct": "Correct / adjust", "reset": "Close period and record opening balances", "reset_data": "Reset business data"}


@dataclass
class Col:
    key: str
    label: str
    align: str = "left"
    kind: str = "text"  # text | money | date | datetime | badge | image | bool | number


@dataclass
class Cap:
    supported: bool
    why: str = ""  # shown when unsupported: the reason and the supported alternative


YES = Cap(True)


def no(why: str) -> Cap:
    return Cap(False, why)


@dataclass
class ModuleSpec:
    key: str
    label: str
    group: str
    noun: str
    query: Callable[[uuid.UUID], Select]
    base: type
    columns: list[Col]
    ops: dict[str, Cap]
    dates: dict[str, tuple[object, str]] = field(default_factory=dict)  # date type -> (column, label)
    filters: dict[str, object] = field(default_factory=dict)  # filter name -> column
    search: list = field(default_factory=list)
    sorts: dict[str, object] = field(default_factory=dict)
    default_sort: str = "created"
    label_of: str = "reference"  # which selected column names a record in messages
    note: str = ""

    def cap(self, op: str) -> Cap:
        return self.ops.get(op) or no("Not available for this module.")


def _explorer_only(why: str) -> dict[str, Cap]:
    return {op: no(why) for op in OPS}


# ── Modules ──────────────────────────────────────────────────────────────────

def _sales(t):
    return (select(Order.id, Order.order_number.label("reference"), Order.ordered_at.label("date"), Customer.name.label("customer"), User.full_name.label("salesperson"),
                   Branch.name.label("branch"), Order.total.label("amount"), Order.currency_code.label("currency"), Order.amount_paid.label("paid"), Order.status.label("status"),
                   Order.held_reason.label("held_reason"), Order.approved_by.label("approved_by"), Order.archived_at.label("archived_at"),
                   Order.created_at.label("created"), Order.updated_at.label("updated"))
            .select_from(Order).outerjoin(Customer, Customer.id == Order.customer_id).outerjoin(User, User.id == Order.salesperson_id)
            .outerjoin(Branch, Branch.id == Order.branch_id).where(Order.tenant_id == t))


def _customers(t):
    return select(Customer.id, Customer.name.label("reference"), Customer.email, Customer.phone, Customer.customer_type.label("type"), Customer.is_active.label("active"),
                  Customer.created_at.label("created"), Customer.updated_at.label("updated")).where(Customer.tenant_id == t)


def _products(t):
    return select(Product.id, Product.name.label("reference"), Product.sku, Product.image_url.label("image"), Product.stock, Product.price.label("amount"),
                  Product.is_active.label("active"), Product.created_at.label("created"), Product.updated_at.label("updated")).where(Product.tenant_id == t)


def _purchases(t):
    return (select(PurchaseOrder.id, PurchaseOrder.reference.label("reference"), PurchaseOrder.order_date.label("date"), Supplier.name.label("supplier"), Branch.name.label("branch"),
                   PurchaseOrder.total.label("amount"), PurchaseOrder.currency_code.label("currency"), PurchaseOrder.status.label("status"),
                   PurchaseOrder.created_at.label("created"), PurchaseOrder.updated_at.label("updated"))
            .select_from(PurchaseOrder).outerjoin(Supplier, Supplier.id == PurchaseOrder.supplier_id).outerjoin(Branch, Branch.id == PurchaseOrder.branch_id)
            .where(PurchaseOrder.tenant_id == t))


def _expenses(t):
    return (select(Expense.id, Expense.reference.label("reference"), Expense.expense_date.label("date"), Expense.title.label("title"), Expense.category.label("category"),
                   Expense.amount.label("amount"), Expense.currency_code.label("currency"), Expense.status.label("status"), Expense.on_credit.label("on_credit"),
                   Expense.paid_at.label("paid_at"), Expense.created_at.label("created"), Expense.updated_at.label("updated"))
            .where(Expense.tenant_id == t))


def _debts(t):
    return (select(ManualDebt.id, ManualDebt.reference.label("reference"), ManualDebt.issue_date.label("date"), ManualDebt.kind.label("kind"), ManualDebt.amount.label("amount"),
                   ManualDebt.amount_paid.label("paid"), ManualDebt.due_date.label("due"), ManualDebt.created_at.label("created"), ManualDebt.updated_at.label("updated"))
            .where(ManualDebt.tenant_id == t))


def _journals(t):
    return select(Transaction.id, Transaction.reference.label("reference"), Transaction.transaction_date.label("date"), Transaction.type.label("type"), Transaction.status.label("status"),
                  Transaction.description.label("title"), Transaction.created_at.label("created"), Transaction.updated_at.label("updated")).where(Transaction.tenant_id == t)


def _warehouses(t):
    return (select(Warehouse.id, Warehouse.name.label("reference"), Warehouse.code.label("code"), Branch.name.label("branch"), Warehouse.is_active.label("active"),
                   Warehouse.is_default.label("is_default"), Warehouse.created_at.label("created"), Warehouse.updated_at.label("updated"))
            .select_from(Warehouse).outerjoin(Branch, Branch.id == Warehouse.branch_id).where(Warehouse.tenant_id == t))


def _movements(t):
    return (select(StockMovement.id, Product.name.label("reference"), StockMovement.movement_type.label("type"), StockMovement.quantity.label("quantity"), Warehouse.name.label("warehouse"),
                   StockMovement.reference_number.label("document"), StockMovement.created_at.label("created"))
            .select_from(StockMovement).join(Product, Product.id == StockMovement.product_id).join(Warehouse, Warehouse.id == StockMovement.warehouse_id)
            .where(StockMovement.tenant_id == t))


def _transfers(t):
    return select(StockTransfer.id, StockTransfer.transfer_number.label("reference"), StockTransfer.status.label("status"), StockTransfer.created_at.label("created"),
                  StockTransfer.updated_at.label("updated")).where(StockTransfer.tenant_id == t)


def _production(t):
    return select(ProductionOrder.id, ProductionOrder.order_number.label("reference"), ProductionOrder.product_name.label("title"), ProductionOrder.quantity.label("quantity"),
                  ProductionOrder.status.label("status"), ProductionOrder.scheduled_date.label("date"), ProductionOrder.created_at.label("created"),
                  ProductionOrder.updated_at.label("updated")).where(ProductionOrder.tenant_id == t)


def _employees(t):
    return select(Employee.id, func.concat(Employee.first_name, " ", Employee.last_name).label("reference"), Employee.job_title.label("title"), Employee.email.label("email"),
                  Employee.employment_status.label("status"), Employee.hire_date.label("date"), Employee.created_at.label("created"), Employee.updated_at.label("updated")).where(Employee.tenant_id == t)


def _services(t):
    return select(Service.id, Service.name.label("reference"), Service.price.label("amount"), Service.duration_minutes.label("minutes"), Service.is_active.label("active"),
                  Service.created_at.label("created"), Service.updated_at.label("updated")).where(Service.tenant_id == t)


def _users(t):
    return (select(User.id, User.full_name.label("reference"), User.email.label("email"), User.role.label("role"), Branch.name.label("branch"), User.is_active.label("active"),
                   User.last_login.label("last_login"), User.created_at.label("created"), User.updated_at.label("updated"))
            .select_from(User).outerjoin(Branch, Branch.id == User.branch_id).where(User.tenant_id == t))


def _branches(t):
    return select(Branch.id, Branch.name.label("reference"), Branch.location.label("title"), Branch.status.label("status"), Branch.is_main.label("is_main"),
                  Branch.created_at.label("created"), Branch.updated_at.label("updated")).where(Branch.tenant_id == t)


SALES = ModuleSpec(
    "sales", "Sales & POS", "Sales & POS", "sale", _sales, Order,
    [Col("reference", "Sale"), Col("date", "Date", kind="datetime"), Col("customer", "Customer"), Col("salesperson", "Salesperson"), Col("branch", "Branch"), Col("amount", "Amount", "right", "money"),
     Col("payment_status", "Payment", kind="badge"), Col("approval_status", "Approval", kind="badge"), Col("status", "Status", kind="badge")],
    {"archive": YES, "delete": YES, "clean_test": YES, "correct": YES,
     "reset": no("Closing a period is done once for the whole business from Accounting, not from the sales list.")},
    dates={"transaction": (Order.ordered_at, "Sale date"), "created": (Order.created_at, "Created"), "updated": (Order.updated_at, "Updated")},
    filters={"status": Order.status, "branch_id": Order.branch_id, "created_by": Order.created_by, "salesperson_id": Order.salesperson_id, "customer_id": Order.customer_id, "reference": Order.order_number},
    search=[Order.order_number, Customer.name], sorts={"reference": Order.order_number, "date": Order.ordered_at, "amount": Order.total, "created": Order.created_at, "status": Order.status},
    default_sort="date", note="A sale that has been paid or posted is never deleted: reverse it with Void, or archive it. Archiving keeps its payments and books entries.")

CUSTOMERS = ModuleSpec(
    "customers", "Customers", "Customers & CRM", "customer", _customers, Customer,
    [Col("reference", "Customer"), Col("email", "Email"), Col("phone", "Phone"), Col("type", "Type", kind="badge"), Col("active", "Active", kind="bool"), Col("created", "Created", kind="date")],
    {"archive": YES, "delete": YES, "clean_test": YES, "correct": YES, "reset": no("Not applicable to customers.")},
    dates={"created": (Customer.created_at, "Created"), "updated": (Customer.updated_at, "Updated")},
    filters={"reference": Customer.name}, search=[Customer.name, Customer.email, Customer.phone], sorts={"reference": Customer.name, "created": Customer.created_at},
    note="A customer with any sale, return, quotation, deal or debt is archived, never deleted, so their invoices stay intact.")

PRODUCTS = ModuleSpec(
    "products", "Products & Inventory", "Products & Inventory", "product", _products, Product,
    [Col("image", "", kind="image"), Col("reference", "Product"), Col("sku", "SKU"), Col("stock", "Stock", "right", "number"), Col("amount", "Price", "right", "money"),
     Col("active", "Active", kind="bool"), Col("created", "Created", kind="date")],
    {"archive": YES, "delete": YES, "clean_test": YES, "correct": YES,
     "reset": no("Stock quantities are corrected with stock counts and adjustments, never reset from here.")},
    dates={"created": (Product.created_at, "Created"), "updated": (Product.updated_at, "Updated")},
    filters={"reference": Product.name}, search=[Product.name, Product.sku, Product.barcode], sorts={"reference": Product.name, "sku": Product.sku, "stock": Product.stock, "created": Product.created_at},
    note="A product that was ever sold, bought, moved or counted is archived, never deleted, so history keeps its name.")

PURCHASES = ModuleSpec(
    "purchases", "Purchases", "Purchases", "purchase", _purchases, PurchaseOrder,
    [Col("reference", "Purchase"), Col("date", "Date", kind="date"), Col("supplier", "Supplier"), Col("branch", "Branch"), Col("amount", "Amount", "right", "money"), Col("status", "Status", kind="badge")],
    {"archive": no("Purchases have no archive state. Cancel or complete them in Purchases."), "delete": YES, "clean_test": YES,
     "correct": no("Correct a purchase from Purchases: edit while draft, or record a supplier return."), "reset": no("Not applicable to purchases.")},
    dates={"transaction": (PurchaseOrder.order_date, "Order date"), "created": (PurchaseOrder.created_at, "Created"), "updated": (PurchaseOrder.updated_at, "Updated")},
    filters={"status": PurchaseOrder.status, "branch_id": PurchaseOrder.branch_id, "created_by": PurchaseOrder.created_by, "supplier_id": PurchaseOrder.supplier_id, "reference": PurchaseOrder.reference},
    search=[PurchaseOrder.reference, Supplier.name], sorts={"reference": PurchaseOrder.reference, "date": PurchaseOrder.order_date, "amount": PurchaseOrder.total, "created": PurchaseOrder.created_at},
    default_sort="date", note="Only draft purchases that nothing has been received against can be deleted.")

EXPENSES = ModuleSpec(
    "expenses", "Expenses", "Expenses", "expense", _expenses, Expense,
    [Col("reference", "Expense"), Col("date", "Date", kind="date"), Col("title", "Description"), Col("category", "Category"), Col("amount", "Amount", "right", "money"), Col("status", "Status", kind="badge")],
    {"archive": no("Expenses have no archive state. Reverse a posted expense in Expenses."), "delete": YES, "clean_test": YES,
     "correct": no("Correct an expense in Expenses: reclassify or reverse it, which keeps the books."), "reset": no("Not applicable to expenses.")},
    dates={"transaction": (Expense.expense_date, "Expense date"), "created": (Expense.created_at, "Created"), "updated": (Expense.updated_at, "Updated")},
    filters={"status": Expense.status, "branch_id": Expense.branch_id, "created_by": Expense.created_by, "supplier_id": Expense.supplier_id, "reference": Expense.reference},
    search=[Expense.reference, Expense.title], sorts={"reference": Expense.reference, "date": Expense.expense_date, "amount": Expense.amount, "created": Expense.created_at},
    default_sort="date", note="Only expenses that were rejected, or never approved and never posted, can be deleted.")

DEBTS = ModuleSpec(
    "debts", "Debt Management", "Debt Management", "debt", _debts, ManualDebt,
    [Col("reference", "Debt"), Col("kind", "Kind", kind="badge"), Col("date", "Issued", kind="date"), Col("due", "Due", kind="date"), Col("amount", "Amount", "right", "money"), Col("paid", "Paid", "right", "money")],
    _explorer_only("Debts carry payments and books entries. They are written off or voided in Debt Management, which keeps the history."),
    dates={"transaction": (ManualDebt.issue_date, "Issue date"), "created": (ManualDebt.created_at, "Created"), "updated": (ManualDebt.updated_at, "Updated")},
    filters={"created_by": ManualDebt.created_by, "customer_id": ManualDebt.customer_id, "supplier_id": ManualDebt.supplier_id, "branch_id": ManualDebt.branch_id, "reference": ManualDebt.reference},
    search=[ManualDebt.reference], sorts={"reference": ManualDebt.reference, "date": ManualDebt.issue_date, "amount": ManualDebt.amount, "created": ManualDebt.created_at}, default_sort="date")

ACCOUNTING = ModuleSpec(
    "accounting", "Accounting", "Accounting", "journal", _journals, Transaction,
    [Col("reference", "Journal"), Col("date", "Date", kind="date"), Col("type", "Type", kind="badge"), Col("title", "Description"), Col("status", "Status", kind="badge")],
    {"archive": no("Journals are permanent. A wrong entry is reversed, never archived."), "delete": no("Posted journals cannot be deleted. Reverse them from the business's Ledger."),
     "clean_test": no("Journals are never removed as test data."), "correct": no("Correct with a reversing or adjusting journal from the business's Ledger. Direct edits are not allowed."),
     "reset": YES},
    dates={"posting": (Transaction.transaction_date, "Posting date"), "created": (Transaction.created_at, "Created"), "updated": (Transaction.updated_at, "Updated")},
    filters={"status": Transaction.status, "branch_id": Transaction.branch_id, "created_by": Transaction.created_by, "reference": Transaction.reference},
    search=[Transaction.reference, Transaction.description], sorts={"reference": Transaction.reference, "date": Transaction.transaction_date, "created": Transaction.created_at}, default_sort="date",
    note="Closing a period locks the books through a date and records the opening position. Journals themselves are never edited or deleted.")

WAREHOUSES = ModuleSpec(
    "warehouses", "Warehouses", "Warehouses", "warehouse", _warehouses, Warehouse,
    [Col("reference", "Warehouse"), Col("code", "Code"), Col("branch", "Branch"), Col("active", "Active", kind="bool"), Col("is_default", "Default", kind="bool"), Col("created", "Created", kind="date")],
    {"archive": YES, "delete": no("A warehouse is part of the stock history. Deactivate it once it is empty."), "clean_test": no("Warehouses are not removed as test data."),
     "correct": YES, "reset": no("Not applicable to warehouses.")},
    dates={"created": (Warehouse.created_at, "Created"), "updated": (Warehouse.updated_at, "Updated")},
    filters={"branch_id": Warehouse.branch_id, "reference": Warehouse.name}, search=[Warehouse.name, Warehouse.code], sorts={"reference": Warehouse.name, "created": Warehouse.created_at},
    note="Archiving deactivates the warehouse. It must hold no stock and have no unfinished transfers or counts.")

MOVEMENTS = ModuleSpec(
    "stock_movements", "Stock movements", "Warehouses", "movement", _movements, StockMovement,
    [Col("created", "Date", kind="datetime"), Col("reference", "Product"), Col("warehouse", "Warehouse"), Col("type", "Type", kind="badge"), Col("quantity", "Quantity", "right", "number"), Col("document", "Document")],
    _explorer_only("The stock ledger is append-only. A wrong movement is corrected by a stock count or adjustment, never edited."),
    dates={"created": (StockMovement.created_at, "Date")}, filters={"warehouse_id": StockMovement.warehouse_id, "created_by": StockMovement.user_id},
    search=[Product.name, StockMovement.reference_number], sorts={"created": StockMovement.created_at, "reference": Product.name}, default_sort="created", label_of="reference")

TRANSFERS = ModuleSpec(
    "stock_transfers", "Stock transfers", "Warehouses", "transfer", _transfers, StockTransfer,
    [Col("reference", "Transfer"), Col("status", "Status", kind="badge"), Col("created", "Created", kind="datetime")],
    _explorer_only("Transfers carry stock movements. Complete or cancel them in Inventory → Transfers."),
    dates={"created": (StockTransfer.created_at, "Created"), "updated": (StockTransfer.updated_at, "Updated")},
    filters={"status": StockTransfer.status, "created_by": StockTransfer.created_by, "reference": StockTransfer.transfer_number},
    search=[StockTransfer.transfer_number], sorts={"reference": StockTransfer.transfer_number, "created": StockTransfer.created_at})

MANUFACTURING = ModuleSpec(
    "manufacturing", "Manufacturing", "Manufacturing", "production order", _production, ProductionOrder,
    [Col("reference", "Order"), Col("title", "Product"), Col("quantity", "Quantity", "right", "number"), Col("date", "Scheduled", kind="date"), Col("status", "Status", kind="badge")],
    _explorer_only("Production orders consume and produce stock. Cancel or complete them in Manufacturing."),
    dates={"transaction": (ProductionOrder.scheduled_date, "Scheduled date"), "created": (ProductionOrder.created_at, "Created"), "updated": (ProductionOrder.updated_at, "Updated")},
    filters={"status": ProductionOrder.status, "branch_id": ProductionOrder.branch_id, "reference": ProductionOrder.order_number},
    search=[ProductionOrder.order_number, ProductionOrder.product_name], sorts={"reference": ProductionOrder.order_number, "created": ProductionOrder.created_at})

HR = ModuleSpec(
    "hr", "HR", "HR", "employee", _employees, Employee,
    [Col("reference", "Employee"), Col("title", "Job title"), Col("email", "Email"), Col("status", "Status", kind="badge"), Col("date", "Hired", kind="date")],
    _explorer_only("Employee records feed payroll and leave history. Change them in HR."),
    dates={"transaction": (Employee.hire_date, "Hire date"), "created": (Employee.created_at, "Created"), "updated": (Employee.updated_at, "Updated")},
    filters={"status": Employee.employment_status}, search=[Employee.first_name, Employee.last_name, Employee.email], sorts={"created": Employee.created_at})

SERVICES = ModuleSpec(
    "services", "Services", "Services", "service", _services, Service,
    [Col("reference", "Service"), Col("amount", "Price", "right", "money"), Col("minutes", "Minutes", "right", "number"), Col("active", "Active", kind="bool")],
    _explorer_only("Services are used by appointments and sales. Change them in Services."),
    dates={"created": (Service.created_at, "Created"), "updated": (Service.updated_at, "Updated")}, filters={"reference": Service.name}, search=[Service.name], sorts={"reference": Service.name, "created": Service.created_at})

USERS = ModuleSpec(
    "users", "Users & Access", "Users & Access", "user", _users, User,
    [Col("reference", "User"), Col("email", "Email"), Col("role", "Role", kind="badge"), Col("branch", "Branch"), Col("active", "Active", kind="bool"), Col("last_login", "Last sign-in", kind="datetime")],
    {"archive": YES, "delete": no("A user stays on the history of what they did. Deactivate them instead."), "clean_test": no("Users are never removed as test data."),
     "correct": no("Roles and permissions are changed from the business's Team and Access screens."), "reset": no("Not applicable to users.")},
    dates={"created": (User.created_at, "Created"), "updated": (User.updated_at, "Updated")}, filters={"branch_id": User.branch_id},
    search=[User.full_name, User.email], sorts={"reference": User.full_name, "created": User.created_at},
    note="Archiving deactivates the person: they can no longer sign in. The last active owner cannot be deactivated.")

BRANCHES = ModuleSpec(
    "branches", "Branches", "Branches", "branch", _branches, Branch,
    [Col("reference", "Branch"), Col("title", "Location"), Col("status", "Status", kind="badge"), Col("is_main", "Main", kind="bool")],
    _explorer_only("A branch is referenced by sales, stock and users. Manage it in Branches."),
    dates={"created": (Branch.created_at, "Created"), "updated": (Branch.updated_at, "Updated")}, filters={"status": Branch.status}, search=[Branch.name, Branch.location], sorts={"reference": Branch.name, "created": Branch.created_at})

MODULES: dict[str, ModuleSpec] = {m.key: m for m in (SALES, CUSTOMERS, PRODUCTS, PURCHASES, EXPENSES, DEBTS, ACCOUNTING, WAREHOUSES, MOVEMENTS, TRANSFERS, MANUFACTURING, HR, SERVICES, USERS, BRANCHES)}

FILTER_LABELS = {"status": "Status", "branch_id": "Branch", "created_by": "Created by", "salesperson_id": "Salesperson", "customer_id": "Customer", "supplier_id": "Supplier",
                 "warehouse_id": "Warehouse", "reference": "Reference"}
