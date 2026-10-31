"""Read-only report breakdowns on the same filters as the performance report: sales by product/category/customer/branch/employee/payment,
operations (stock, purchases, customers) and financial (expenses, money owed). Everything is aggregated in the database for the tenant
and the branches the person may see; a section the person has no permission for is returned as null, never partially filled."""
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.models.expense import Expense
from app.modules.inventory.models.category import Category
from app.modules.inventory.models.product import Product
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.reporting.repository.daily import DailyRepository
from app.modules.reporting.service.performance import (
    EXPENSE,
    LINE,
    SALES,
    Report,
    _allowed_branches,
    _orders,
    money,
)
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.service.feature import feature_enabled

DIMENSIONS = ("product", "category", "customer", "branch", "employee", "payment")


def can(user: User, permission: str) -> bool:
    return user.is_superuser or permission in user.permissions_names


async def _setup(db: AsyncSession, user: User, start: date | None, end: date | None, branch_id: uuid.UUID | None, need: str):
    if user.tenant_id is None:
        raise ValidationError("This account has no tenant")
    if not can(user, need):
        raise ForbiddenError(f"Permission required: {need}")
    tenant = await db.get(Tenant, user.tenant_id)
    branches = await _allowed_branches(db, user, tenant.id, branch_id)
    zone = ZoneInfo(tenant.timezone)
    end = end or datetime.now(zone).date()
    if start is None:
        first = (await db.execute(select(func.min(Order.ordered_at)).where(Order.tenant_id == tenant.id))).scalar_one()
        start = first.astimezone(zone).date() if first else end
    if start > end:
        raise ValidationError("The start date must not be after the end date")
    can_expenses = can(user, "expenses:read") and await feature_enabled(db, tenant.id, "accounting")
    return tenant, branches, start, end, Report(db, tenant, branches, can_expenses)


async def sales_breakdown(db: AsyncSession, user: User, start: date | None, end: date | None, branch_id: uuid.UUID | None,
                          dimension: str, limit: int = 50) -> dict:
    if dimension not in DIMENSIONS:
        raise ValidationError(f"Choose one of: {', '.join(DIMENSIONS)}")
    tenant, branches, start, end, report = await _setup(db, user, start, end, branch_id, "orders:read")
    s, e = report.window(start, end)
    cost = OrderItem.cost_at_sale * OrderItem.quantity
    missing = func.count(OrderItem.id).filter(OrderItem.cost_at_sale.is_(None))
    base = select(func.coalesce(func.sum(LINE), 0), func.coalesce(func.sum(cost), 0), missing, func.coalesce(func.sum(OrderItem.quantity), 0),
                  func.count(func.distinct(Order.id))).select_from(OrderItem).join(Order, Order.id == OrderItem.order_id)
    if dimension == "product":
        key, label = OrderItem.product_name, OrderItem.product_name
    elif dimension == "category":
        base = base.outerjoin(Product, Product.id == OrderItem.product_id).outerjoin(Category, Category.id == Product.category_id)
        key = label = func.coalesce(Category.name, "Uncategorised")
    elif dimension == "customer":
        base = base.outerjoin(Customer, Customer.id == Order.customer_id)
        key = label = func.coalesce(Customer.name, "Walk-in customers")
    elif dimension == "employee":
        base = base.outerjoin(User, User.id == Order.created_by)
        key = label = func.coalesce(User.full_name, "Not recorded")
    elif dimension == "payment":
        key = label = func.coalesce(Order.payment_method, "Not recorded")
    else:
        key, label = Order.branch_id, Order.branch_id
    stmt = _orders(base.add_columns(key), tenant.id, branches, s, e).group_by(key).order_by(func.sum(LINE).desc()).limit(limit)
    raw = (await db.execute(stmt)).all()
    names = {}
    if dimension == "branch":
        from app.modules.tenants.repository import BranchRepository
        names = await BranchRepository(db).names_for_ids(tenant.id, {r[5] for r in raw if r[5]})
    rows = []
    for r in raw:
        revenue, cogs = money(r[0]), money(r[1])
        profit = None if r[2] else round(revenue - cogs, 2)
        name = names.get(r[5], "Not assigned to a branch") if dimension == "branch" else r[5]
        rows.append({"name": name, "sales": revenue, "orders": int(r[4]), "quantity": float(r[3]), "cost": None if r[2] else cogs,
                     "gross_profit": profit, "margin": round(profit / revenue * 100, 1) if profit is not None and revenue else None})
    del label
    return {"from_date": start, "to_date": end, "currency": tenant.currency, "dimension": dimension, "rows": rows,
            "totals": await report.metrics(start, end),
            "note": "Item sales before order-level discounts and VAT. Profit is shown only where every sold item has a cost."}


async def operations(db: AsyncSession, user: User, start: date | None, end: date | None, branch_id: uuid.UUID | None) -> dict:
    tenant, branches, start, end, report = await _setup(db, user, start, end, branch_id, "orders:read")
    s, e = report.window(start, end)
    out: dict = {"from_date": start, "to_date": end, "currency": tenant.currency, "inventory": None, "purchases": None, "customers": None}

    if can(user, "items:read") and await feature_enabled(db, tenant.id, "inventory"):
        stock = await report.stock()
        sold = (select(OrderItem.product_id, func.sum(OrderItem.quantity).label("qty")).select_from(OrderItem).join(Order, Order.id == OrderItem.order_id))
        sold = _orders(sold, tenant.id, branches, s, e).where(OrderItem.product_id.is_not(None)).group_by(OrderItem.product_id).subquery()
        active = (Product.tenant_id == tenant.id, Product.is_active.is_(True))
        low = (await db.execute(select(Product.name, Product.stock, Product.min_stock).where(*active, Product.stock <= Product.min_stock).order_by(Product.stock).limit(15))).all()
        fast = (await db.execute(select(Product.name, sold.c.qty, Product.stock).join(sold, sold.c.product_id == Product.id).where(*active).order_by(sold.c.qty.desc()).limit(10))).all()
        slow = (await db.execute(select(Product.name, Product.stock, Product.stock * Product.cost).outerjoin(sold, sold.c.product_id == Product.id)
                                 .where(*active, Product.stock > 0, sold.c.qty.is_(None)).order_by((Product.stock * Product.cost).desc()).limit(10))).all()
        out["inventory"] = {**stock, "low": [{"name": r[0], "stock": float(r[1]), "min_stock": float(r[2])} for r in low],
                            "fast_moving": [{"name": r[0], "sold": float(r[1]), "stock": float(r[2])} for r in fast],
                            "slow_moving": [{"name": r[0], "stock": float(r[1]), "value": money(r[2])} for r in slow],
                            "note": "Stock is today's position. Fast movers sold most in the period; slow movers have stock but no sales in it. Inventory turnover is not calculated."}

    if can(user, "purchase_orders:read") and await feature_enabled(db, tenant.id, "procurement"):
        from app.modules.inventory.models.supplier import Supplier
        amount = func.coalesce(PurchaseOrder.base_total, PurchaseOrder.total * func.coalesce(PurchaseOrder.exchange_rate, 1))
        po = (PurchaseOrder.tenant_id == tenant.id, PurchaseOrder.created_at >= s, PurchaseOrder.created_at < e, PurchaseOrder.status != "Cancelled")
        scope = (PurchaseOrder.branch_id.in_(branches),) if branches is not None else ()
        by_status = (await db.execute(select(PurchaseOrder.status, func.count(PurchaseOrder.id), func.coalesce(func.sum(amount), 0)).where(*po, *scope).group_by(PurchaseOrder.status))).all()
        top = (await db.execute(select(func.coalesce(Supplier.name, "No supplier"), func.coalesce(func.sum(amount), 0), func.count(PurchaseOrder.id))
                                .select_from(PurchaseOrder).outerjoin(Supplier, Supplier.id == PurchaseOrder.supplier_id).where(*po, *scope)
                                .group_by(Supplier.name).order_by(func.sum(amount).desc()).limit(8))).all()
        out["purchases"] = {"total": money(sum(r[2] for r in by_status)), "orders": int(sum(r[1] for r in by_status)),
                            "by_status": [{"status": r[0], "orders": int(r[1]), "amount": money(r[2])} for r in by_status],
                            "top_suppliers": [{"name": r[0], "amount": money(r[1]), "orders": int(r[2])} for r in top]}

    if can(user, "contacts:read"):
        buyers_stmt = _orders(select(Order.customer_id, func.count(Order.id), func.coalesce(func.sum(SALES), 0)), tenant.id, branches, s, e).where(Order.customer_id.is_not(None)).group_by(Order.customer_id)
        buyers = (await db.execute(buyers_stmt)).all()
        ids = [r[0] for r in buyers]
        before = set((await db.execute(select(Order.customer_id).where(Order.tenant_id == tenant.id, Order.status == "Completed", Order.ordered_at < s, Order.customer_id.in_(ids)).distinct())).scalars().all()) if ids else set()
        new_customers = (await db.execute(select(func.count(Customer.id)).where(Customer.tenant_id == tenant.id, Customer.created_at >= s, Customer.created_at < e))).scalar_one()
        names = dict((await db.execute(select(Customer.id, Customer.name).where(Customer.id.in_(ids)))).all()) if ids else {}
        top_buyers = sorted(buyers, key=lambda r: r[2], reverse=True)[:10]
        out["customers"] = {"new_customers": int(new_customers), "buying_customers": len(buyers), "returning": sum(1 for r in buyers if r[0] in before),
                            "orders_per_customer": round(sum(r[1] for r in buyers) / len(buyers), 1) if buyers else None,
                            "top": [{"name": names.get(r[0], "Customer"), "orders": int(r[1]), "sales": money(r[2])} for r in top_buyers],
                            "receivables": money(await DailyRepository(db).outstanding_debt(tenant.id, branches)) if can(user, "accounts_receivable:read") else None}
    return out


async def financial(db: AsyncSession, user: User, start: date | None, end: date | None, branch_id: uuid.UUID | None) -> dict:
    tenant, branches, start, end, report = await _setup(db, user, start, end, branch_id, "expenses:read")
    if not report.can_expenses:
        raise ForbiddenError("Accounting is not available for this business")
    scope = (Expense.branch_id.in_(branches),) if branches is not None else ()
    where = (Expense.tenant_id == tenant.id, Expense.status == "Approved", Expense.expense_date >= start, Expense.expense_date <= end, *scope)
    by_cat = (await db.execute(select(Expense.category, func.coalesce(func.sum(EXPENSE), 0), func.count(Expense.id)).where(*where).group_by(Expense.category).order_by(func.sum(EXPENSE).desc()))).all()
    by_branch = (await db.execute(select(Expense.branch_id, func.coalesce(func.sum(EXPENSE), 0)).where(*where).group_by(Expense.branch_id).order_by(func.sum(EXPENSE).desc()))).all()
    from app.modules.tenants.repository import BranchRepository
    names = await BranchRepository(db).names_for_ids(tenant.id, {r[0] for r in by_branch if r[0]})
    largest = (await db.execute(select(Expense.title, Expense.category, Expense.expense_date, EXPENSE).where(*where).order_by(EXPENSE.desc()).limit(5))).all()
    total = money(sum(r[1] for r in by_cat))
    pending = (await db.execute(select(func.count(Expense.id)).where(Expense.tenant_id == tenant.id, Expense.status == "Pending", Expense.expense_date >= start, Expense.expense_date <= end, *scope))).scalar_one()
    return {"from_date": start, "to_date": end, "currency": tenant.currency, "expenses_total": total, "pending_expenses": int(pending),
            "by_category": [{"name": r[0], "amount": money(r[1]), "count": int(r[2]), "share": round(float(r[1]) / float(total) * 100, 1) if total else 0} for r in by_cat],
            "by_branch": [{"name": names.get(r[0], "Not assigned to a branch"), "amount": money(r[1])} for r in by_branch],
            "largest": [{"title": r[0], "category": r[1], "date": r[2].isoformat(), "amount": money(r[3])} for r in largest],
            "receivables": money(await DailyRepository(db).outstanding_debt(tenant.id, branches)) if can(user, "accounts_receivable:read") else None,
            "metrics": await report.metrics(start, end)}
