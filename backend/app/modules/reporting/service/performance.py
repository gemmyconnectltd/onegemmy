"""Business performance for any period: KPIs, a trend, breakdowns and insights, computed in the database for the tenant and the
branches the person may see. Money is in the business's base currency (each record's own base amount, falling back to its recorded
exchange rate), so currencies are never added together raw.

Definitions (also returned to the UI):
- Sales: completed orders in the period, VAT included. Net sales exclude VAT. Revenue is not cash received.
- Gross profit: net sales minus the cost recorded on each item when it was sold. It is shown only when every sold item has a cost.
- Expenses: approved expenses dated in the period. Net profit = gross profit - expenses, shown only when both are known.
- Returns: approved returns dated in the period, shown separately and not netted into profit.
"""
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Date, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.models.expense import Expense
from app.modules.inventory.models.product import Product
from app.modules.reporting.repository.daily import DailyRepository
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.return_ import Return
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.repository import BranchRepository
from app.modules.tenants.service.feature import feature_enabled

DEFINITIONS = {
    "sales": "Completed sales in the period, VAT included. Revenue is what was sold, not the cash received.",
    "gross_profit": "Net sales (without VAT) minus the cost recorded when each item was sold. Shown only when every sold item has a cost.",
    "expenses": "Approved expenses dated in the period.",
    "net_profit": "Gross profit minus approved expenses. Shown only when both are known.",
    "returns": "Approved returns dated in the period. They are shown separately and not subtracted from profit.",
}

_RATE = func.coalesce(Order.exchange_rate, 1)
SALES = func.coalesce(Order.base_total, Order.total * _RATE)
TAX = func.coalesce(Order.base_tax, Order.tax * _RATE)
DISCOUNT = func.coalesce(Order.base_discount, Order.discount * _RATE)
EXPENSE = func.coalesce(Expense.base_amount, Expense.amount * func.coalesce(Expense.exchange_rate, 1))
REFUND = func.coalesce(Return.base_refund_amount, Return.refund_amount * func.coalesce(Return.exchange_rate, 1))
# An item's share of the order total, in base currency.
LINE = OrderItem.line_total * func.coalesce(Order.base_total / func.nullif(Order.total, 0), _RATE)


def money(value) -> float:
    return float(round(Decimal(value or 0), 2))


def grain_for(days: int) -> str:
    return "day" if days <= 31 else "week" if days <= 120 else "month" if days <= 1100 else "year"


def bucket_start(day: date, grain: str) -> date:
    if grain == "week":
        return day - timedelta(days=day.weekday())
    if grain == "month":
        return day.replace(day=1)
    if grain == "year":
        return day.replace(month=1, day=1)
    return day


def next_bucket(day: date, grain: str) -> date:
    if grain == "week":
        return day + timedelta(days=7)
    if grain == "month":
        return (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    if grain == "year":
        return day.replace(year=day.year + 1)
    return day + timedelta(days=1)


def same_period_last_year(start: date, end: date) -> tuple[date, date]:
    def shift(d: date) -> date:
        try:
            return d.replace(year=d.year - 1)
        except ValueError:  # 29 February
            return d.replace(year=d.year - 1, day=28)
    return shift(start), shift(end)


def previous_period(start: date, end: date) -> tuple[date, date]:
    days = (end - start).days + 1
    return start - timedelta(days=days), start - timedelta(days=1)


def pct_change(current: float, previous: float) -> float | None:
    return None if not previous else round((current - previous) / abs(previous) * 100, 1)


async def _allowed_branches(db: AsyncSession, user: User, tenant_id: uuid.UUID, branch_id: uuid.UUID | None) -> list[uuid.UUID] | None:
    allowed = ([uuid.UUID(str(i)) for i in user.branch_ids] if user.branch_ids is not None
               else [user.branch_id] if user.branch_id else None)
    if branch_id:
        if allowed is not None and branch_id not in allowed:
            raise ForbiddenError("This branch is not assigned to your account")
        if await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id) is None:
            raise ValidationError("Choose a branch belonging to this business")
        allowed = [branch_id]
    return allowed


def _orders(stmt, tenant_id, branches, start_dt, end_dt):
    stmt = stmt.where(Order.tenant_id == tenant_id, Order.status == "Completed", Order.ordered_at >= start_dt, Order.ordered_at < end_dt)
    return stmt.where(Order.branch_id.in_(branches)) if branches is not None else stmt


class Report:
    """One report run: the same filters applied to every figure, so the numbers always agree with each other."""

    def __init__(self, db: AsyncSession, tenant: Tenant, branches: list[uuid.UUID] | None, can_expenses: bool):
        self.db, self.tenant, self.branches, self.can_expenses = db, tenant, branches, can_expenses
        self.zone = ZoneInfo(tenant.timezone)

    def window(self, start: date, end: date) -> tuple[datetime, datetime]:
        return datetime.combine(start, time.min, self.zone), datetime.combine(end + timedelta(days=1), time.min, self.zone)

    async def expenses_total(self, start: date, end: date) -> float | None:
        if not self.can_expenses:
            return None
        stmt = select(func.coalesce(func.sum(EXPENSE), 0)).where(Expense.tenant_id == self.tenant.id, Expense.status == "Approved", Expense.expense_date >= start, Expense.expense_date <= end)
        if self.branches is not None:
            stmt = stmt.where(Expense.branch_id.in_(self.branches))
        return money((await self.db.execute(stmt)).scalar_one())

    async def returns_total(self, start: date, end: date) -> float:
        stmt = select(func.coalesce(func.sum(REFUND), 0)).where(Return.tenant_id == self.tenant.id, Return.status == "Approved", Return.return_date >= start, Return.return_date <= end)
        if self.branches is not None:
            stmt = stmt.join(Order, Order.id == Return.order_id).where(Order.branch_id.in_(self.branches))
        return money((await self.db.execute(stmt)).scalar_one())

    async def metrics(self, start: date, end: date) -> dict:
        s, e = self.window(start, end)
        row = (await self.db.execute(_orders(select(func.coalesce(func.sum(SALES), 0), func.coalesce(func.sum(TAX), 0),
                                                    func.coalesce(func.sum(DISCOUNT), 0), func.count(Order.id)), self.tenant.id, self.branches, s, e))).one()
        sales, tax, discount, orders = money(row[0]), money(row[1]), money(row[2]), int(row[3])
        cost = (await self.db.execute(_orders(select(
            func.coalesce(func.sum(OrderItem.cost_at_sale * OrderItem.quantity), 0),
            func.count(OrderItem.id).filter(OrderItem.cost_at_sale.is_(None))).select_from(OrderItem).join(Order, Order.id == OrderItem.order_id),
            self.tenant.id, self.branches, s, e))).one()
        cogs, missing = money(cost[0]), int(cost[1])
        expenses = await self.expenses_total(start, end)
        net_sales = round(sales - tax, 2)
        gross = round(net_sales - cogs, 2) if orders and not missing else None
        return {
            "sales": sales, "net_sales": net_sales, "tax": tax, "discount": discount, "orders": orders,
            "average_order": money(sales / orders) if orders else None,
            "cost_of_goods": cogs if orders and not missing else None, "items_missing_cost": missing,
            "gross_profit": gross, "gross_margin": round(gross / net_sales * 100, 1) if gross is not None and net_sales else None,
            "expenses": expenses, "returns": await self.returns_total(start, end),
            "net_profit": round(gross - expenses, 2) if gross is not None and expenses is not None else None,
        }

    async def series(self, start: date, end: date, grain: str, profit_known: bool) -> list[dict]:
        s, e = self.window(start, end)
        tz = self.tenant.timezone
        day = cast(func.date_trunc(grain, func.timezone(tz, Order.ordered_at)), Date)
        sales = {r[0]: r for r in (await self.db.execute(_orders(select(day, func.coalesce(func.sum(SALES), 0), func.coalesce(func.sum(TAX), 0), func.count(Order.id)),
                                                                self.tenant.id, self.branches, s, e).group_by(day))).all()}
        cogs = {r[0]: money(r[1]) for r in (await self.db.execute(_orders(select(day, func.coalesce(func.sum(OrderItem.cost_at_sale * OrderItem.quantity), 0))
                                                                         .select_from(OrderItem).join(Order, Order.id == OrderItem.order_id), self.tenant.id, self.branches, s, e).group_by(day))).all()}
        spend: dict[date, float] = {}
        if self.can_expenses:
            eday = cast(func.date_trunc(grain, Expense.expense_date), Date)
            stmt = select(eday, func.coalesce(func.sum(EXPENSE), 0)).where(Expense.tenant_id == self.tenant.id, Expense.status == "Approved", Expense.expense_date >= start, Expense.expense_date <= end)
            if self.branches is not None:
                stmt = stmt.where(Expense.branch_id.in_(self.branches))
            spend = {r[0]: money(r[1]) for r in (await self.db.execute(stmt.group_by(eday))).all()}
        out, cursor = [], bucket_start(start, grain)
        while cursor <= end:
            r = sales.get(cursor)
            rev, tax, count = (money(r[1]), money(r[2]), int(r[3])) if r else (0.0, 0.0, 0)
            expense = spend.get(cursor, 0.0) if self.can_expenses else None
            out.append({"date": cursor.isoformat(), "sales": rev, "orders": count, "expenses": expense,
                        "profit": round(rev - tax - cogs.get(cursor, 0.0) - (expense or 0.0), 2) if profit_known and expense is not None else None})
            cursor = next_bucket(cursor, grain)
        return out

    async def top_products(self, start: date, end: date, limit: int = 5, only: list | None = None) -> list[dict]:
        s, e = self.window(start, end)
        stmt = _orders(select(OrderItem.product_name, func.coalesce(func.sum(LINE), 0).label("revenue"), func.coalesce(func.sum(OrderItem.quantity), 0))
                       .select_from(OrderItem).join(Order, Order.id == OrderItem.order_id), self.tenant.id, self.branches, s, e)
        if only is not None:
            stmt = stmt.where(OrderItem.product_name.in_(only))
        rows = (await self.db.execute(stmt.group_by(OrderItem.product_name).order_by(func.sum(LINE).desc()).limit(limit))).all()
        return [{"name": r[0], "revenue": money(r[1]), "quantity": float(r[2])} for r in rows]

    async def by_branch(self, start: date, end: date) -> list[dict]:
        s, e = self.window(start, end)
        rows = (await self.db.execute(_orders(select(Order.branch_id, func.coalesce(func.sum(SALES), 0), func.count(Order.id)), self.tenant.id, self.branches, s, e)
                                      .group_by(Order.branch_id).order_by(func.sum(SALES).desc()))).all()
        names = await BranchRepository(self.db).names_for_ids(self.tenant.id, {r[0] for r in rows if r[0]})
        return [{"id": str(r[0]) if r[0] else None, "name": names.get(r[0], "Not assigned to a branch"), "sales": money(r[1]), "orders": int(r[2])} for r in rows]

    async def by_payment(self, start: date, end: date) -> list[dict]:
        s, e = self.window(start, end)
        label = func.coalesce(Order.payment_method, "Not recorded")
        rows = (await self.db.execute(_orders(select(label, func.coalesce(func.sum(SALES), 0), func.count(Order.id)), self.tenant.id, self.branches, s, e)
                                      .group_by(label).order_by(func.sum(SALES).desc()))).all()
        return [{"method": r[0], "sales": money(r[1]), "orders": int(r[2])} for r in rows]

    async def stock(self) -> dict:
        low = case((Product.stock <= Product.min_stock, 1), else_=0)
        out = case((Product.stock <= 0, 1), else_=0)
        r = (await self.db.execute(select(func.coalesce(func.sum(low), 0), func.coalesce(func.sum(out), 0), func.coalesce(func.sum(Product.stock * Product.cost), 0), func.count(Product.id))
                                   .where(Product.tenant_id == self.tenant.id, Product.is_active.is_(True)))).one()
        return {"low_stock": int(r[0]), "out_of_stock": int(r[1]), "valuation": money(r[2]), "products": int(r[3])}


def _label(start: date, end: date) -> str:
    return start.isoformat() if start == end else f"{start.isoformat()} to {end.isoformat()}"


def build_insights(cur: dict, prev: dict | None, currency: str, branches: list[dict], products: list[dict], declining: list[dict]) -> list[dict]:
    out: list[dict] = []
    sales_pct = exp_pct = None
    if prev and prev["sales"] > 0:
        sales_pct = pct_change(cur["sales"], prev["sales"])
        out.append({"tone": "positive" if sales_pct >= 0 else "negative", "href": "/sales/orders",
                    "text": f"Sales {'rose' if sales_pct >= 0 else 'fell'} {abs(sales_pct)}% to {currency} {cur['sales']:,.0f} compared with the comparison period."})
    if prev and cur["expenses"] is not None and prev["expenses"]:
        exp_pct = pct_change(cur["expenses"], prev["expenses"])
        if exp_pct is not None and exp_pct > 0 and (sales_pct is None or exp_pct > sales_pct):
            out.append({"tone": "negative", "href": "/expenses/list",
                        "text": f"Expenses grew {exp_pct}%" + (f", faster than sales ({sales_pct:+}%)." if sales_pct is not None else ".")})
    if len([b for b in branches if b["sales"] > 0]) > 1 and cur["sales"] > 0:
        top = branches[0]
        out.append({"tone": "neutral", "text": f"{top['name']} contributed {round(top['sales'] / cur['sales'] * 100)}% of sales."})
    for item in declining[:2]:
        out.append({"tone": "negative", "text": f"Sales of {item['name']} fell {item['drop']}% compared with the comparison period."})
    if cur["items_missing_cost"]:
        out.append({"tone": "neutral", "text": f"{cur['items_missing_cost']} sold item(s) have no recorded cost, so profit is not shown for this period."})
    return out


async def performance(db: AsyncSession, user: User, start: date | None, end: date | None, branch_id: uuid.UUID | None,
                      compare: str = "none", compare_from: date | None = None, compare_to: date | None = None) -> dict:
    if user.tenant_id is None:
        raise ValidationError("This account has no tenant")
    if not user.is_superuser and "orders:read" not in user.permissions_names:
        raise ForbiddenError("Permission required: orders:read")
    tenant = await db.get(Tenant, user.tenant_id)
    branches = await _allowed_branches(db, user, tenant.id, branch_id)
    zone = ZoneInfo(tenant.timezone)
    today = datetime.now(zone).date()
    if end is None:
        end = today
    if start is None:
        first = (await db.execute(select(func.min(Order.ordered_at)).where(Order.tenant_id == tenant.id))).scalar_one()
        start = first.astimezone(zone).date() if first else end
    if start > end:
        raise ValidationError("The start date must not be after the end date")
    can_expenses = (user.is_superuser or "expenses:read" in user.permissions_names) and await feature_enabled(db, tenant.id, "accounting")
    report = Report(db, tenant, branches, can_expenses)
    days = (end - start).days + 1
    grain = grain_for(days)
    current = await report.metrics(start, end)
    profit_known = current["gross_profit"] is not None
    series = await report.series(start, end, grain, profit_known)

    comparison = None
    if compare in ("previous", "year", "custom"):
        if compare == "custom":
            if not (compare_from and compare_to) or compare_from > compare_to:
                raise ValidationError("Choose a comparison period with the start before the end")
            c_start, c_end = compare_from, compare_to
        else:
            c_start, c_end = previous_period(start, end) if compare == "previous" else same_period_last_year(start, end)
        prev = await report.metrics(c_start, c_end)
        has_data = bool(prev["orders"] or prev["expenses"] or prev["returns"])
        comparison = {"mode": compare, "from_date": c_start, "to_date": c_end, "label": _label(c_start, c_end), "has_data": has_data, "metrics": prev if has_data else None,
                      "changes": {k: {"change": round(current[k] - prev[k], 2), "percent": pct_change(current[k], prev[k])}
                                  for k in ("sales", "net_sales", "orders", "expenses", "gross_profit", "net_profit", "average_order", "returns")
                                  if has_data and current.get(k) is not None and prev.get(k) is not None} if has_data else {}}

    top = await report.top_products(start, end)
    by_branch = await report.by_branch(start, end)
    declining: list[dict] = []
    if comparison and comparison["has_data"] and top:
        before = {r["name"]: r["revenue"] for r in await report.top_products(comparison["from_date"], comparison["to_date"], limit=len(top), only=[t["name"] for t in top])}
        declining = [{"name": t["name"], "drop": round((before[t["name"]] - t["revenue"]) / before[t["name"]] * 100)} for t in top
                     if before.get(t["name"]) and t["revenue"] < before[t["name"]] * 0.8]
    receivables = None
    if user.is_superuser or "accounts_receivable:read" in user.permissions_names:
        receivables = money(await DailyRepository(db).outstanding_debt(tenant.id, branches))
    stock = await report.stock() if (user.is_superuser or "items:read" in user.permissions_names) and await feature_enabled(db, tenant.id, "inventory") else None
    insights = build_insights(current, comparison["metrics"] if comparison and comparison["has_data"] else None, tenant.currency, by_branch, top, declining)
    return {
        "from_date": start, "to_date": end, "days": days, "grain": grain, "currency": tenant.currency, "timezone": tenant.timezone,
        "branch_id": str(branch_id) if branch_id else None, "definitions": DEFINITIONS,
        "current": current, "comparison": comparison, "series": series, "insights": insights,
        "top_products": top, "by_branch": by_branch, "by_payment": await report.by_payment(start, end),
        "receivables": receivables, "stock": stock, "can_see_expenses": can_expenses,
    }
