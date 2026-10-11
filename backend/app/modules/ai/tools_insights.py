"""Read-only business-intelligence tools: profit, trends, comparisons, stock value, slow movers, customers,
suppliers, unpaid invoices/bills and a whole-business check-up. Same rules as tools.py: scope comes only from
`ToolContext`, money is in the business's base currency, every figure is computed here — never by the model."""
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal

from pydantic import Field
from sqlalchemy import and_, func, select

from app.core.currency import format_money, to_decimal
from app.modules.accounting.models.expense import Expense
from app.modules.ai.tools import (
    REGISTRY,
    LimitArgs,
    Period,
    PeriodArgs,
    ToolContext,
    ToolError,
    _Args,
    _card,
    _chart,
    _dt,
    _label,
    _order_scope,
    _result,
    _tool_allowed,
    _trend,
    resolve_period,
    tool,
)
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem

_SALE = func.coalesce(Order.base_total, Order.total)


class CompareArgs(_Args):
    first: Period = "this_month"
    second: Period = "last_month"


class DaysArgs(_Args):
    days: int = Field(default=60, ge=7, le=365)
    limit: int = Field(default=10, ge=1, le=20)


class SupplierSpendArgs(PeriodArgs):
    limit: int = Field(default=5, ge=1, le=10)


async def _sales_between(ctx: ToolContext, s, e) -> tuple[int, Decimal]:
    row = (await ctx.db.execute(
        select(func.count(), func.coalesce(func.sum(_SALE), 0)).where(
            *_order_scope(ctx), Order.status == "Completed", Order.ordered_at >= _dt(s), Order.ordered_at < _dt(e + timedelta(days=1)))
    )).one()
    return row[0], to_decimal(row[1])


async def _refunds_between(ctx: ToolContext, s, e) -> Decimal:
    from app.modules.sales.models.return_ import Return

    val = (await ctx.db.execute(
        select(func.coalesce(func.sum(func.coalesce(Return.base_refund_amount, Return.refund_amount)), 0))
        .where(Return.tenant_id == ctx.tenant_id, Return.status == "Approved", Return.return_date >= s, Return.return_date <= e)
    )).scalar_one()
    return to_decimal(val)


async def _expenses_between(ctx: ToolContext, s, e) -> Decimal:
    val = (await ctx.db.execute(
        select(func.coalesce(func.sum(func.coalesce(Expense.base_amount, Expense.amount)), 0))
        .where(Expense.tenant_id == ctx.tenant_id, Expense.status == "Approved", Expense.expense_date >= s, Expense.expense_date <= e)
    )).scalar_one()
    return to_decimal(val)


class CountArgs(_Args):
    what: Literal["products", "customers", "suppliers", "employees"] = "products"


@tool("how_many", "Count records the business has: products (with how many are in stock / out of stock), customers, suppliers or employees. "
      "Use for 'how many products/customers/suppliers/staff do we have'.", module=None, permission=None, args=CountArgs)
async def how_many(ctx: ToolContext, a: CountArgs) -> dict[str, Any]:
    from app.modules.inventory.models.product import Product
    from app.modules.inventory.models.supplier import Supplier
    from app.modules.tenants.service.feature import feature_enabled

    need = {"products": ("inventory", "stock:read"), "suppliers": ("inventory", "stock:read"),
            "customers": ("sales", "orders:read"), "employees": ("hr", "employees:read")}[a.what]
    if not ctx.can(need[1]):
        raise ToolError("You don't have permission to do or see that.")
    if not await feature_enabled(ctx.db, ctx.tenant_id, need[0]):
        raise ToolError("That part of Pesaa isn't turned on for your business.")
    if a.what == "products":
        row = (await ctx.db.execute(select(
            func.count(), func.count().filter(Product.is_active.is_(True)), func.count().filter(Product.is_active.is_(True), Product.stock > 0),
        ).where(Product.tenant_id == ctx.tenant_id))).one()
        total, active, in_stock = row
        out = active - in_stock
        return _result("how_many", f"You have {total} product{'' if total == 1 else 's'}: {active} active, of which {in_stock} "
                       f"{'is' if in_stock == 1 else 'are'} in stock and {out} {'is' if out == 1 else 'are'} out of stock.", ctx,
                       how="Counts the products saved in your inventory.", links=[{"label": "Open Products", "href": "/inventory/products"}],
                       metrics={"total": total, "active": active, "in_stock": in_stock, "out_of_stock": out})
    if a.what == "customers":
        n = (await ctx.db.execute(select(func.count()).where(Customer.tenant_id == ctx.tenant_id, Customer.is_active.is_(True)))).scalar_one()
        link = {"label": "Open Customers", "href": "/customers"}
    elif a.what == "suppliers":
        n = (await ctx.db.execute(select(func.count()).where(Supplier.tenant_id == ctx.tenant_id))).scalar_one()
        link = {"label": "Open Suppliers", "href": "/inventory/suppliers"}
    else:
        from app.modules.hr.models.employee import Employee

        n = (await ctx.db.execute(select(func.count()).where(Employee.tenant_id == ctx.tenant_id))).scalar_one()
        link = {"label": "Open HR", "href": "/hr"}
    return _result("how_many", f"You have {n} {a.what if n != 1 else a.what.rstrip('s')}.", ctx, how=f"Counts the {a.what} saved in Pesaa.",
                   links=[link], metrics={"total": n})


class FindProductsArgs(_Args):
    search: str = Field(default="", max_length=80)
    sort: Literal["name", "most_stock", "least_stock", "highest_price", "lowest_price"] = "name"
    limit: int = Field(default=8, ge=1, le=15)


@tool("find_products", "Look up products: price, cost and stock of a named product, or rank products (most/least stock, highest/lowest price). "
      "Use for 'price of X', 'how much X do we have', 'most expensive product', 'which product has the most stock', 'list my products'.",
      module="inventory", permission="stock:read", args=FindProductsArgs)
async def find_products(ctx: ToolContext, a: FindProductsArgs) -> dict[str, Any]:
    from app.modules.inventory.models.product import Product

    order = {"name": Product.name.asc(), "most_stock": Product.stock.desc(), "least_stock": Product.stock.asc(),
             "highest_price": Product.price.desc(), "lowest_price": Product.price.asc()}[a.sort]
    conds = [Product.tenant_id == ctx.tenant_id, Product.is_active.is_(True)]
    term = a.search.strip().replace("%", "").replace("_", " ")
    if term:
        conds.append(Product.name.ilike(f"%{term}%") | Product.sku.ilike(f"%{term}%"))
    total = (await ctx.db.execute(select(func.count()).where(*conds))).scalar_one()
    rows = (await ctx.db.execute(select(Product.name, Product.sku, Product.price, Product.cost, Product.stock).where(*conds).order_by(order).limit(a.limit))).all()
    cur = ctx.base_currency
    if not rows:
        return _result("find_products", f"I couldn't find a product matching \"{term}\"." if term else "You have no active products yet.", ctx,
                       how="Searches your active products by name or code.", links=[{"label": "Open Products", "href": "/inventory/products"}])
    first = rows[0]
    if len(rows) == 1:
        headline = (f"{first.name}: {float(first.stock):g} in stock, selling at {format_money(first.price, cur)}"
                    f"{f' (cost {format_money(first.cost, cur)})' if float(first.cost) > 0 else ''}.")
    elif term:
        headline = f"{total} product{'' if total == 1 else 's'} match \"{term}\"{'' if total <= len(rows) else f'; showing {len(rows)}'}."
    else:
        label = {"name": "Here are your products", "most_stock": "Most in stock is " + first.name, "least_stock": "Least in stock is " + first.name,
                 "highest_price": "Most expensive is " + first.name, "lowest_price": "Cheapest is " + first.name}[a.sort]
        headline = f"{label} ({total} active products in all)."
    return _result("find_products", headline, ctx, how="Looks at your active products and their saved stock, price and cost.",
                   links=[{"label": "Open Products", "href": "/inventory/products"}], metrics={"matches": total},
                   table={"columns": ["Product", "In stock", f"Price ({cur})", f"Cost ({cur})"],
                          "rows": [[r.name, f"{float(r.stock):g}", format_money(r.price, cur), format_money(r.cost, cur) if float(r.cost) > 0 else "—"] for r in rows]})


class FindPeopleArgs(_Args):
    search: str = Field(default="", max_length=80)
    limit: int = Field(default=8, ge=1, le=15)


@tool("find_customers", "Find customers by name, or list them: how long each has been a customer, order count and what they spent. "
      "Use for 'do we have a customer called X', 'list my customers', 'how much has X bought'.",
      module="sales", permission="orders:read", args=FindPeopleArgs)
async def find_customers(ctx: ToolContext, a: FindPeopleArgs) -> dict[str, Any]:
    term = a.search.strip().replace("%", "").replace("_", " ")
    conds = [Customer.tenant_id == ctx.tenant_id, Customer.is_active.is_(True)]
    if term:
        conds.append(Customer.name.ilike(f"%{term}%"))
    spent = func.coalesce(func.sum(_SALE).filter(Order.status == "Completed"), 0)
    rows = (await ctx.db.execute(
        select(Customer.name, func.count(Order.id).label("n"), spent.label("spent"), func.max(Order.ordered_at).label("last"))
        .outerjoin(Order, and_(Order.customer_id == Customer.id, *_order_scope(ctx)))
        .where(*conds).group_by(Customer.id, Customer.name).order_by(spent.desc(), Customer.name.asc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("find_customers", f"I couldn't find a customer matching \"{term}\"." if term else "You have no customers yet.", ctx,
                       how="Searches your customers by name.", links=[{"label": "Open Customers", "href": "/customers"}])
    headline = (f"{rows[0].name} has placed {rows[0].n} order{'' if rows[0].n == 1 else 's'} worth {format_money(rows[0].spent, cur)}."
                if len(rows) == 1 else f"Found {len(rows)} customer{'' if len(rows) == 1 else 's'}{f' matching \"{term}\"' if term else ' (biggest spenders first)'}.")
    return _result("find_customers", headline, ctx, branch_scoped=True, how="Looks at your customers and their completed sales. Contact details are kept private.",
                   links=[{"label": "Open Customers", "href": "/customers"}],
                   table={"columns": ["Customer", "Orders", f"Spent ({cur})", "Last order"],
                          "rows": [[r.name, r.n, format_money(r.spent, cur), str(r.last.date()) if r.last else "—"] for r in rows]})


@tool("find_suppliers", "Find or list suppliers by name, with their usual delivery time. Use for 'who are my suppliers', 'do we have a supplier called X'.",
      module="inventory", permission="stock:read", args=FindPeopleArgs)
async def find_suppliers(ctx: ToolContext, a: FindPeopleArgs) -> dict[str, Any]:
    from app.modules.inventory.models.supplier import Supplier

    term = a.search.strip().replace("%", "").replace("_", " ")
    conds = [Supplier.tenant_id == ctx.tenant_id]
    if term:
        conds.append(Supplier.name.ilike(f"%{term}%"))
    rows = (await ctx.db.execute(select(Supplier.name, Supplier.lead_time_days).where(*conds).order_by(Supplier.name).limit(a.limit))).all()
    if not rows:
        return _result("find_suppliers", f"I couldn't find a supplier matching \"{term}\"." if term else "You have no suppliers yet.", ctx,
                       how="Searches your suppliers by name.", links=[{"label": "Open Suppliers", "href": "/inventory/suppliers"}])
    return _result("find_suppliers", f"Found {len(rows)} supplier{'' if len(rows) == 1 else 's'}{f' matching \"{term}\"' if term else ''}.", ctx,
                   how="Lists your saved suppliers.", links=[{"label": "Open Suppliers", "href": "/inventory/suppliers"}],
                   table={"columns": ["Supplier", "Usual delivery time"], "rows": [[r.name, f"{r.lead_time_days} days" if r.lead_time_days else "Not set"] for r in rows]})


@tool("orders_overview", "How many sales orders there were in a period and their status (completed, pending, cancelled…) with values. "
      "Use for 'how many orders today', 'pending orders', 'cancelled orders this month'.", module="sales", permission="orders:read", args=PeriodArgs)
async def orders_overview(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    s, e, _, _ = resolve_period(a.period)
    rows = (await ctx.db.execute(
        select(Order.status, func.count(), func.coalesce(func.sum(_SALE), 0)).where(
            *_order_scope(ctx), Order.ordered_at >= _dt(s), Order.ordered_at < _dt(e + timedelta(days=1))).group_by(Order.status).order_by(func.count().desc())
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("orders_overview", f"There were no orders in {_label(a.period)} ({s} to {e}).", ctx, period=(s, e),
                       how="Counts your sales orders by status.", links=[], branch_scoped=True)
    n = sum(r[1] for r in rows)
    parts = ", ".join(f"{r[1]} {str(r[0]).lower()}" for r in rows)
    return _result("orders_overview", f"{n} order{'' if n == 1 else 's'} in {_label(a.period)} ({s} to {e}): {parts}.", ctx, period=(s, e), branch_scoped=True,
                   how="Counts your sales orders in this period by their status.", links=[{"label": "Open Sales orders", "href": "/sales/orders"}],
                   metrics={str(r[0]): r[1] for r in rows},
                   table={"columns": ["Status", "Orders", f"Value ({cur})"], "rows": [[r[0], r[1], format_money(r[2], cur)] for r in rows]})


@tool("about_me", "Who is signed in and where they are working: the user's name, role, email, business, branch, currency and plan. "
      "Use for 'who am I', 'who is logged in', 'which branch am I in', 'what is my role', 'which business is this'.",
      module=None, permission=None, args=_Args)
async def about_me(ctx: ToolContext, a: _Args) -> dict[str, Any]:
    from app.modules.tenants.models import Branch, Tenant

    tenant = await ctx.db.get(Tenant, ctx.tenant_id)
    branch_id = ctx.branch_id or ctx.user.branch_id
    branch = await ctx.db.get(Branch, branch_id) if branch_id else None
    # Only ever the signed-in user's own details, and never the password hash or other people's records.
    role = "Business owner" if ctx.user.is_superuser else str(ctx.user.role or "member").replace("_", " ").title()
    where = f"{branch.name} branch" if branch and branch.tenant_id == ctx.tenant_id else "all branches"
    biz = tenant.name if tenant else "your business"
    return _result("about_me", f"You are signed in as {ctx.user.full_name} ({role}) at {biz}, working in {where}. "
                   f"Your business uses {ctx.base_currency}{f' and is on the {tenant.subscription_plan} plan' if tenant and tenant.subscription_plan else ''}.",
                   ctx, how="Taken from your signed-in account.", links=[{"label": "Open My Profile", "href": "/settings/profile"}],
                   metrics={"name": ctx.user.full_name, "role": role, "business": biz, "branch": where})


@tool("compare_sales", "Compare sales between two periods (default: this month vs last month): totals, orders and the change.",
      module="sales", permission="orders:read", args=CompareArgs)
async def compare_sales(ctx: ToolContext, a: CompareArgs) -> dict[str, Any]:
    s1, e1, _, _ = resolve_period(a.first)
    s2, e2, _, _ = resolve_period(a.second)
    n1, r1 = await _sales_between(ctx, s1, e1)
    n2, r2 = await _sales_between(ctx, s2, e2)
    cur = ctx.base_currency
    first, second = _label(a.first), _label(a.second)
    headline = (f"{first.capitalize()}: {format_money(r1, cur)} from {n1} order{'' if n1 == 1 else 's'}. "
                f"{second.capitalize()}: {format_money(r2, cur)} from {n2} order{'' if n2 == 1 else 's'}. {_trend(r1, r2, second)}")
    return _result("compare_sales", headline, ctx, period=(s1, e1), branch_scoped=True,
                   how=f"Adds up completed sales for {first} ({s1} to {e1}) and for {second} ({s2} to {e2}). If one period is still running, it has fewer days.",
                   links=[{"label": "Open Sales", "href": "/sales/orders"}],
                   chart=_chart("Sales comparison", [second, first], [r2, r1], cur),
                   metrics={"first": str(r1), "second": str(r2), "first_orders": n1, "second_orders": n2})


@tool("revenue_trend", "Sales over time as a trend: daily for up to 31 days, otherwise monthly. Use for 'show my revenue trend'.",
      module="sales", permission="orders:read", args=PeriodArgs)
async def revenue_trend(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    s, e, _, _ = resolve_period(a.period)
    unit = "day" if (e - s).days <= 31 else "month"
    bucket = func.date_trunc(unit, Order.ordered_at)
    rows = (await ctx.db.execute(
        select(bucket.label("b"), func.coalesce(func.sum(_SALE), 0).label("v"), func.count().label("n"))
        .where(*_order_scope(ctx), Order.status == "Completed", Order.ordered_at >= _dt(s), Order.ordered_at < _dt(e + timedelta(days=1)))
        .group_by(bucket).order_by(bucket)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("revenue_trend", f"You had no completed sales in {_label(a.period)} ({s} to {e}), so there is no trend to show.", ctx,
                       period=(s, e), how="Groups your completed sales by day or month.", links=[])
    best = max(rows, key=lambda r: r.v)
    fmt = "%d %b" if unit == "day" else "%b %Y"
    total = sum((to_decimal(r.v) for r in rows), Decimal(0))
    headline = (f"You made {format_money(total, cur)} in {_label(a.period)}. Your best {unit} was {best.b.strftime(fmt)} "
                f"with {format_money(best.v, cur)}.")
    return _result("revenue_trend", headline, ctx, period=(s, e), branch_scoped=True,
                   how=f"Adds up completed sales for each {unit} in this period.", links=[{"label": "Open Sales", "href": "/sales/orders"}],
                   chart=_chart("Sales trend", [r.b.strftime(fmt) for r in rows], [r.v for r in rows], cur),
                   metrics={"total": str(total), "best_label": best.b.strftime(fmt), "best_value": str(to_decimal(best.v))})


@tool("profit_summary", "Profit for a period: sales, refunds, cost of goods sold, expenses, gross and net profit.",
      module="accounting", permission="journal_entries:read", args=PeriodArgs)
async def profit_summary(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    s, e, ps, pe = resolve_period(a.period)
    cur = ctx.base_currency
    sales_n, sales = await _sales_between(ctx, s, e)
    refunds = await _refunds_between(ctx, s, e)
    expenses = await _expenses_between(ctx, s, e)
    window = [*_order_scope(ctx), Order.status == "Completed", Order.ordered_at >= _dt(s), Order.ordered_at < _dt(e + timedelta(days=1))]
    cogs_row = (await ctx.db.execute(
        select(
            func.coalesce(func.sum(OrderItem.cost_at_sale * OrderItem.quantity * func.coalesce(Order.exchange_rate, 1)), 0),
            func.count().filter(OrderItem.cost_at_sale.is_(None)), func.count(),
        ).select_from(OrderItem).join(Order, Order.id == OrderItem.order_id).where(*window)
    )).one()
    cogs, missing, lines = to_decimal(cogs_row[0]), cogs_row[1], cogs_row[2]
    if sales_n == 0 and expenses == 0:
        return _result("profit_summary", f"There are no completed sales or approved expenses in {_label(a.period)} ({s} to {e}), so there is no profit to report.",
                       ctx, period=(s, e), how="Needs completed sales and approved expenses in the period.", links=[])
    net_sales = sales - refunds
    gross = net_sales - cogs
    net = gross - expenses
    prev_n, prev_sales = await _sales_between(ctx, ps, pe)
    prev_net = prev_sales - await _refunds_between(ctx, ps, pe) - await _expenses_between(ctx, ps, pe)
    note = None
    if lines and missing:
        note = (f"{missing} of {lines} sold items have no purchase cost saved, so their cost is counted as zero and the profit may look higher than it really is."
                if missing < lines else
                "None of the items sold have a purchase cost saved, so I can't work out a reliable profit. Add costs to your products to get one.")
    headline = (f"For {_label(a.period)} ({s} to {e}) your sales were {format_money(sales, cur)}, "
                f"refunds {format_money(refunds, cur)}, cost of the goods sold {format_money(cogs, cur)} and expenses {format_money(expenses, cur)}. "
                f"That leaves a profit of {format_money(net, cur)}.")
    if prev_n and prev_net != 0:
        headline += " " + _trend(net, prev_net, "the period before")
    return _result("profit_summary", headline, ctx, period=(s, e), branch_scoped=True, note=note, heading="Profit", tone="positive" if net > 0 else "attention",
                   how="Sales minus approved refunds, minus what the sold goods cost you, minus approved expenses. Sales include VAT; expenses are not split by branch.",
                   links=[{"label": "Open Reports", "href": "/reports"}],
                   cards=[_card("Sales", format_money(sales, cur)), _card("Gross profit", format_money(gross, cur)),
                          _card("Net profit", format_money(net, cur), "positive" if net > 0 else "critical")],
                   metrics={"sales": str(sales), "refunds": str(refunds), "cogs": str(cogs), "expenses": str(expenses), "net_profit": str(net)})


@tool("inventory_value", "Current stock value at cost and at selling price, plus the products holding the most value.",
      module="inventory", permission="stock:read", args=LimitArgs)
async def inventory_value(ctx: ToolContext, a: LimitArgs) -> dict[str, Any]:
    from app.modules.inventory.models.product import Product

    base = [Product.tenant_id == ctx.tenant_id, Product.is_active.is_(True), Product.stock > 0]
    tot = (await ctx.db.execute(select(
        func.coalesce(func.sum(Product.stock * Product.cost), 0), func.coalesce(func.sum(Product.stock * Product.price), 0),
        func.count(), func.count().filter(Product.cost <= 0),
    ).where(*base))).one()
    cur = ctx.base_currency
    if tot[2] == 0:
        return _result("inventory_value", "You have no products in stock right now.", ctx, how="Adds up stock on hand for active products.", links=[])
    top = (await ctx.db.execute(
        select(Product.name, Product.stock, (Product.stock * Product.cost).label("v")).where(*base).order_by((Product.stock * Product.cost).desc()).limit(a.limit)
    )).all()
    cost_v, sell_v = to_decimal(tot[0]), to_decimal(tot[1])
    note = f"{tot[3]} product{'' if tot[3] == 1 else 's'} in stock have no purchase cost saved, so they add nothing to the cost value." if tot[3] else None
    return _result("inventory_value", f"Your stock is worth {format_money(cost_v, cur)} at cost, or {format_money(sell_v, cur)} if it all sold at your current prices ({tot[2]} products in stock).",
                   ctx, how="Multiplies the quantity in stock by each product's cost (and by its selling price) for all active products.", note=note,
                   links=[{"label": "Open Inventory", "href": "/inventory"}],
                   cards=[_card("Value at cost", format_money(cost_v, cur)), _card("At selling price", format_money(sell_v, cur))],
                   metrics={"cost_value": str(cost_v), "retail_value": str(sell_v), "products": tot[2]},
                   table={"columns": ["Product", "In stock", f"Value at cost ({cur})"], "rows": [[r.name, f"{float(r.stock):g}", format_money(r.v, cur)] for r in top]})


@tool("slow_moving_products", "Products that are in stock but selling slowly or not at all over the last N days (default 60).",
      module="inventory", permission="stock:read", args=DaysArgs)
async def slow_moving_products(ctx: ToolContext, a: DaysArgs) -> dict[str, Any]:
    from app.modules.inventory.models.product import Product

    since = datetime.now(UTC) - timedelta(days=a.days)
    sold = (
        select(OrderItem.product_id.label("pid"), func.sum(OrderItem.quantity).label("qty"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(*_order_scope(ctx), Order.status == "Completed", Order.ordered_at >= since, OrderItem.product_id.is_not(None))
        .group_by(OrderItem.product_id).subquery()
    )
    qty = func.coalesce(sold.c.qty, 0)
    rows = (await ctx.db.execute(
        select(Product.name, Product.stock, qty.label("qty"), (Product.stock * Product.cost).label("tied"))
        .outerjoin(sold, sold.c.pid == Product.id)
        .where(Product.tenant_id == ctx.tenant_id, Product.is_active.is_(True), Product.stock > 0)
        .order_by(qty.asc(), (Product.stock * Product.cost).desc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("slow_moving_products", "You have no products in stock to review.", ctx, how="Looks at products currently in stock.", links=[])
    none = sum(1 for r in rows if r.qty == 0)
    headline = (f"{none} of the {len(rows)} slowest products sold nothing in the last {a.days} days." if none else
                f"Here are your {len(rows)} slowest-selling products over the last {a.days} days.")
    return _result("slow_moving_products", headline, ctx, branch_scoped=True,
                   how=f"Compares units sold in the last {a.days} days with what is in stock, slowest first. Cash tied up uses each product's cost.",
                   links=[{"label": "Open Inventory", "href": "/inventory"}],
                   table={"columns": ["Product", "In stock", f"Sold ({a.days} days)", f"Cash tied up ({cur})"],
                          "rows": [[r.name, f"{float(r.stock):g}", f"{float(r.qty):g}", format_money(r.tied, cur)] for r in rows]})


@tool("new_customers", "How many new customers were added in a period, compared with the previous period.",
      module="sales", permission="orders:read", args=PeriodArgs)
async def new_customers(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    s, e, ps, pe = resolve_period(a.period)

    async def count(x, y) -> int:
        return (await ctx.db.execute(select(func.count()).where(
            Customer.tenant_id == ctx.tenant_id, Customer.created_at >= _dt(x), Customer.created_at < _dt(y + timedelta(days=1))))).scalar_one()

    n, prev = await count(s, e), await count(ps, pe)
    return _result("new_customers", f"You gained {n} new customer{'' if n == 1 else 's'} in {_label(a.period)} ({s} to {e}). "
                   f"{_trend(Decimal(n), Decimal(prev), 'the period before')}", ctx, period=(s, e),
                   how="Counts customers added in this period and compares with an equally long period before it.",
                   links=[{"label": "Open Customers", "href": "/customers"}], metrics={"new": n, "previous": prev})


@tool("supplier_spend", "Which suppliers you buy from most (by purchase order value) in a period.",
      module="procurement", permission="purchase_orders:read", args=SupplierSpendArgs)
async def supplier_spend(ctx: ToolContext, a: SupplierSpendArgs) -> dict[str, Any]:
    from app.modules.inventory.models.supplier import Supplier
    from app.modules.procurement.models.purchase_order import PurchaseOrder

    s, e, _, _ = resolve_period(a.period)
    val = func.coalesce(PurchaseOrder.base_total, PurchaseOrder.total)
    rows = (await ctx.db.execute(
        select(func.coalesce(Supplier.name, "No supplier"), func.sum(val).label("v"), func.count().label("n"))
        .select_from(PurchaseOrder).outerjoin(Supplier, Supplier.id == PurchaseOrder.supplier_id)
        .where(PurchaseOrder.tenant_id == ctx.tenant_id, PurchaseOrder.status.notin_(("Draft", "Cancelled")),
               PurchaseOrder.created_at >= _dt(s), PurchaseOrder.created_at < _dt(e + timedelta(days=1)))
        .group_by(Supplier.name).order_by(func.sum(val).desc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("supplier_spend", f"You placed no confirmed purchase orders in {_label(a.period)}.", ctx, period=(s, e),
                       how="Looks at purchase orders that are no longer drafts or cancelled.", links=[])
    total = sum((to_decimal(r.v) for r in rows), Decimal(0))
    return _result("supplier_spend", f"You buy most from {rows[0][0]}: {format_money(rows[0].v, cur)} in {_label(a.period)} ({s} to {e}).", ctx, period=(s, e),
                   how="Adds up purchase orders per supplier, leaving out drafts and cancelled orders.", links=[{"label": "Open Purchases", "href": "/procurement/orders"}],
                   chart=_chart("Spend by supplier", [r[0] for r in rows], [r.v for r in rows], cur), metrics={"top_total": str(total)},
                   table={"columns": ["Supplier", "Orders", f"Value ({cur})"], "rows": [[r[0], r.n, format_money(r.v, cur)] for r in rows]})


@tool("unpaid_invoices", "The list of unpaid customer invoices, oldest/overdue first, with customer, amount left and due date.",
      module="sales", permission="accounts_receivable:read", args=LimitArgs)
async def unpaid_invoices(ctx: ToolContext, a: LimitArgs) -> dict[str, Any]:
    today = datetime.now(UTC).date()
    left = (Order.total - Order.amount_paid) * func.coalesce(Order.exchange_rate, 1)
    rows = (await ctx.db.execute(
        select(Order.order_number, func.coalesce(Customer.name, "Walk-in / no customer").label("cust"), left.label("left"), Order.due_date, Order.ordered_at)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .where(*_order_scope(ctx), Order.status == "Completed", Order.amount_paid < Order.total)
        .order_by(Order.due_date.asc().nulls_last(), Order.ordered_at.asc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("unpaid_invoices", "All your invoices are paid.", ctx, how="Looks at completed sales that are not fully paid.", links=[], branch_scoped=True)
    late = sum(1 for r in rows if r.due_date and r.due_date < today)
    return _result("unpaid_invoices", f"Showing {len(rows)} unpaid invoice{'' if len(rows) == 1 else 's'}; {late} of them {'is' if late == 1 else 'are'} overdue.", ctx,
                   branch_scoped=True, tone="attention" if late else "neutral", how="Lists completed sales not fully paid, overdue and oldest first.",
                   links=[{"label": "Open Invoices", "href": "/accounting/invoices"}],
                   table={"columns": ["Invoice", "Customer", f"Left to pay ({cur})", "Due"],
                          "rows": [[r.order_number, r.cust, format_money(r.left, cur), (str(r.due_date) + (" (overdue)" if r.due_date < today else "")) if r.due_date else "No due date"] for r in rows]})


@tool("unpaid_bills", "The list of unpaid supplier bills (purchases still to be paid), with supplier, amount left and date.",
      module="procurement", permission="accounts_payable:read", args=LimitArgs)
async def unpaid_bills(ctx: ToolContext, a: LimitArgs) -> dict[str, Any]:
    from app.modules.inventory.models.supplier import Supplier
    from app.modules.procurement.models.supplier_bill import SupplierBill

    left = (SupplierBill.amount - SupplierBill.amount_paid) * func.coalesce(SupplierBill.exchange_rate, 1)
    rows = (await ctx.db.execute(
        select(SupplierBill.reference, func.coalesce(Supplier.name, "Unknown supplier").label("sup"), left.label("left"), SupplierBill.bill_date)
        .outerjoin(Supplier, Supplier.id == SupplierBill.supplier_id)
        .where(SupplierBill.tenant_id == ctx.tenant_id, SupplierBill.amount_paid < SupplierBill.amount)
        .order_by(SupplierBill.bill_date.asc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("unpaid_bills", "You have no unpaid supplier bills.", ctx, how="Looks at supplier bills not fully paid.", links=[])
    return _result("unpaid_bills", f"You have {len(rows)} unpaid supplier bill{'' if len(rows) == 1 else 's'}; the oldest is from {rows[0].sup} dated {rows[0].bill_date}.", ctx,
                   tone="attention", how="Lists supplier bills not fully paid, oldest first.", links=[{"label": "Open Purchases", "href": "/procurement/orders"}],
                   table={"columns": ["Bill", "Supplier", f"Left to pay ({cur})", "Bill date"],
                          "rows": [[r.reference, r.sup, format_money(r.left, cur), str(r.bill_date)] for r in rows]})


@tool("business_overview", "A quick check-up of the whole business for a period: sales, expenses, money owed, low stock and best seller. Use for 'how is my business doing?'.",
      module="sales", permission="orders:read", args=PeriodArgs)
async def business_overview(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    parts: list[dict[str, Any]] = []
    for name, args in (("sales_summary", {"period": a.period}), ("expenses_summary", {"period": a.period}), ("receivables", {"limit": 3}),
                       ("low_stock", {"limit": 3}), ("top_products", {"period": a.period, "limit": 1})):
        t = REGISTRY[name]
        if await _tool_allowed(ctx, t):
            parts.append(await t.handler(ctx, t.args_model.model_validate(args)))
    s, e, _, _ = resolve_period(a.period)
    if not parts:
        return _result("business_overview", "I can't see any business figures with your current access.", ctx, how="Combines the sections you are allowed to see.", links=[])
    cards = [c for p in parts for c in p["cards"][:1]]
    return _result("business_overview", " ".join(p["headline"] for p in parts), ctx, period=(s, e), branch_scoped=True, heading="Business check-up",
                   how="Combines your sales, expenses, unpaid invoices, stock levels and best seller for this period. Sections you can't access are left out.",
                   links=[{"label": "Open Dashboard", "href": "/dashboard"}], cards=cards,
                   note=next((p["note"] for p in parts if p.get("note")), None),
                   metrics={p["tool"]: p["metrics"] for p in parts})


