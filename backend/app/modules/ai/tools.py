"""The AI tool registry: the ONLY way the assistant reads Pesaa data.

Security model (why a model can't leak or overreach):
  * A tool's argument schema has no tenant/branch/user fields and forbids extras — the model can't even
    *express* "another tenant". Scope comes exclusively from `ToolContext`, resolved server-side from
    the authenticated user.
  * Every call re-checks, at execution time, that the tenant has the tool's module enabled and that the
    user holds the tool's permission (owners/superusers hold all) — not just when tools are advertised.
  * Tools are deterministic SQL/service calls returning pre-computed numbers + a ready-made `headline`;
    the model explains and prioritises, it never calculates the figures.
  * All money is in the tenant's BASE currency, summed from base-currency columns (never raw mixed
    currencies), and each result states its currency, period and how it was computed.
  * Only `kind="read"` tools run from chat. A write tool would have to go through an explicit
    preview/confirm step; none exist yet.
"""
import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import format_money, to_decimal
from app.modules.accounting.models.expense import Expense
from app.modules.ai.providers import ToolSpec
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.tenants.models import User
from app.modules.tenants.service.feature import feature_enabled


class ToolError(Exception):
    """A tool refused or failed. The message is safe to hand back to the model and user."""


@dataclass(frozen=True)
class ToolContext:
    """Server-resolved scope for one AI request. Never built from model output."""

    db: AsyncSession
    tenant_id: uuid.UUID
    user: User
    base_currency: str
    branch_id: uuid.UUID | None = None  # the user's active branch; None = all branches they may see
    permissions: frozenset[str] = field(default_factory=frozenset)

    def can(self, permission: str) -> bool:
        return self.user.is_superuser or permission in self.permissions


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    module: str | None   # tenant feature flag that must be enabled (None = always available, e.g. help docs)
    permission: str | None  # resource:action the user must hold (None = any signed-in user)
    args_model: type[BaseModel]
    handler: Callable[[ToolContext, Any], Awaitable[dict[str, Any]]]
    # read: returns data. draft: only PREPARES a proposal row for the user to confirm — it changes no
    # business data. Anything that actually writes lives behind the confirm endpoint, never in chat.
    kind: Literal["read", "draft"] = "read"


REGISTRY: dict[str, Tool] = {}


def tool(name: str, description: str, *, module: str | None, permission: str | None, args: type[BaseModel],
         kind: Literal["read", "draft"] = "read"):
    def deco(fn: Callable[[ToolContext, Any], Awaitable[dict[str, Any]]]):
        REGISTRY[name] = Tool(name, description, module, permission, args, fn, kind)
        return fn
    return deco


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")  # an unexpected key (e.g. tenant_id) is a validation error

    @model_validator(mode="before")
    @classmethod
    def _clamp_numbers(cls, data: Any) -> Any:
        """Models often send 0 or 100 for "default"/"all": bring numbers back into each field's allowed range instead of
        failing the whole question. Unknown keys are left alone, so forged ids are still rejected."""
        if not isinstance(data, dict):
            return data
        out = dict(data)
        for name, spec in cls.model_fields.items():
            v = out.get(name)
            if isinstance(v, bool) or not isinstance(v, int | float):
                continue
            for m in spec.metadata:
                lo, hi = getattr(m, "ge", None), getattr(m, "le", None)
                if lo is not None and v < lo:
                    v = lo
                if hi is not None and v > hi:
                    v = hi
            out[name] = int(v) if isinstance(data[name], int) else v
        return out


Period = Literal["today", "last_7_days", "last_30_days", "this_month", "last_month", "last_90_days"]


class PeriodArgs(_Args):
    period: Period = "last_30_days"


class TopProductsArgs(PeriodArgs):
    limit: int = Field(default=5, ge=1, le=10)


class LimitArgs(_Args):
    limit: int = Field(default=10, ge=1, le=20)


# ── helpers ───────────────────────────────────────────────────────────────────

def resolve_period(period: str, today: date | None = None) -> tuple[date, date, date, date]:
    """(start, end, prev_start, prev_end) as inclusive dates; the previous period has equal length."""
    t = today or datetime.now(UTC).date()
    if period == "today":
        s, e = t, t
    elif period == "last_7_days":
        s, e = t - timedelta(days=6), t
    elif period == "last_90_days":
        s, e = t - timedelta(days=89), t
    elif period == "this_month":
        s, e = t.replace(day=1), t
    elif period == "last_month":
        e = t.replace(day=1) - timedelta(days=1)
        s = e.replace(day=1)
    else:  # last_30_days
        s, e = t - timedelta(days=29), t
    days = (e - s).days + 1
    return s, e, s - timedelta(days=days), s - timedelta(days=1)


def _dt(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=UTC)


def _pct(cur: Decimal, prev: Decimal) -> str:
    if prev == 0:
        return "n/a (no sales in the previous period)" if cur else "no change"
    return f"{(cur - prev) / prev * 100:+.1f}%"


def _trend(cur: Decimal, prev: Decimal, before: str) -> str:
    """Plain-English comparison with the previous period, e.g. 'down 33% on the 30 days before (RWF 2,000)'."""
    if prev == 0:
        return f"There was nothing to compare with {before}." if cur else f"Nothing {before} either."
    change = (cur - prev) / prev * 100
    if abs(change) < 0.05:
        return f"That is about the same as {before}."
    return f"That is {'up' if change > 0 else 'down'} {abs(change):.0f}% on {before}."


def _chart(title: str, labels: list[str], values: list[Any], currency: str | None = None) -> dict[str, Any]:
    """A simple bar chart spec the UI draws itself (no chart library, no model involvement)."""
    return {"type": "bar", "title": title, "labels": [str(x) for x in labels], "values": [float(to_decimal(v)) for v in values], "currency": currency}


def _card(label: str, value: Any, tone: str = "neutral", hint: str | None = None) -> dict[str, str]:
    return {"label": label, "value": str(value), "tone": tone, **({"hint": hint} if hint else {})}


def _label(period: str) -> str:
    return period.replace("_", " ")


def _result(name: str, headline: str, ctx: ToolContext, *, how: str, links: list[dict[str, str]],
            period: tuple[date, date] | None = None, table: dict[str, Any] | None = None,
            metrics: dict[str, Any] | None = None, branch_scoped: bool = False,
            chart: dict[str, Any] | None = None, cards: list[dict[str, str]] | None = None, heading: str | None = None,
            tone: str = "neutral", note: str | None = None, followups: list[dict[str, str]] | None = None) -> dict[str, Any]:
    """Every tool result. `cards`/`heading`/`tone`/`note`/`followups` are presentation hints computed from the same
    verified numbers as the headline — the UI renders them as-is and never calculates or invents anything."""
    return {
        "chart": chart, "cards": cards or [], "heading": heading, "tone": tone, "note": note, "followups": followups or [],
        "tool": name, "headline": headline, "currency": ctx.base_currency, "how": how, "links": links,
        "period": {"from": period[0].isoformat(), "to": period[1].isoformat()} if period else None,
        "table": table, "metrics": metrics or {}, "branch_scoped": branch_scoped and ctx.branch_id is not None,
    }


def _order_scope(ctx: ToolContext) -> list[Any]:
    """Tenant (always) + the user's active branch (when one is selected)."""
    conds: list[Any] = [Order.tenant_id == ctx.tenant_id]
    if ctx.branch_id is not None:
        conds.append(Order.branch_id == ctx.branch_id)
    return conds


# ── tools ─────────────────────────────────────────────────────────────────────

@tool("sales_summary", "Total completed sales, order count and average order for a period, compared with the previous period of equal length.",
      module="sales", permission="orders:read", args=PeriodArgs)
async def sales_summary(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    s, e, ps, _pe = resolve_period(a.period)
    cond = and_(Order.status == "Completed")
    amount = func.coalesce(Order.base_total, Order.total)
    row = (await ctx.db.execute(
        select(
            func.count().filter(cond, Order.ordered_at >= _dt(s), Order.ordered_at < _dt(e + timedelta(days=1))).label("n"),
            func.coalesce(func.sum(amount).filter(cond, Order.ordered_at >= _dt(s), Order.ordered_at < _dt(e + timedelta(days=1))), 0).label("rev"),
            func.count().filter(cond, Order.ordered_at < _dt(s)).label("pn"),
            func.coalesce(func.sum(amount).filter(cond, Order.ordered_at < _dt(s)), 0).label("prev"),
        ).where(*_order_scope(ctx), Order.ordered_at >= _dt(ps), Order.ordered_at < _dt(e + timedelta(days=1)))
    )).one()
    rev, prev = to_decimal(row.rev), to_decimal(row.prev)
    avg = rev / row.n if row.n else Decimal(0)
    cur = ctx.base_currency
    before = f"the {(e - s).days + 1} days before"
    headline = (f"You made {format_money(rev, cur)} in sales from {row.n} order{'' if row.n == 1 else 's'} ({_label(a.period)}, {s} to {e}). "
                f"{_trend(rev, prev, before)}")
    return _result("sales_summary", headline, ctx, period=(s, e), branch_scoped=True,
                   how="Adds up your completed sales in this period and compares them with an equally long period just before it.",
                   links=[{"label": "Open Sales orders", "href": "/sales/orders"}],
                   chart=_chart("Sales: previous vs this period", ["Previous period", "This period"], [prev, rev], cur),
                   cards=[_card("Sales", format_money(rev, cur), "positive" if rev >= prev else "attention", _pct(rev, prev)),
                          _card("Completed orders", row.n), _card("Average order", format_money(avg, cur))],
                   followups=[{"label": "Best-selling products", "ask": f"What are my best-selling products {_label(a.period)}?"},
                              {"label": "Who owes me money?", "ask": "Which customers owe me the most?"}],
                   metrics={"revenue": str(rev), "orders": row.n, "previous_revenue": str(prev), "previous_orders": row.pn},
                   table={"columns": ["Metric", "This period", "Previous period"], "rows": [
                       ["Sales", format_money(rev, cur), format_money(prev, cur)],
                       ["Completed orders", row.n, row.pn],
                       ["Average order", format_money(avg, cur), format_money(prev / row.pn if row.pn else 0, cur)],
                   ]})


@tool("top_products", "Best-selling products by sales value in a period.", module="sales", permission="orders:read", args=TopProductsArgs)
async def top_products(ctx: ToolContext, a: TopProductsArgs) -> dict[str, Any]:
    s, e, _, _ = resolve_period(a.period)
    revenue = func.sum(OrderItem.line_total * func.coalesce(Order.exchange_rate, 1))
    rows = (await ctx.db.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity).label("qty"), revenue.label("rev"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(*_order_scope(ctx), Order.status == "Completed", Order.ordered_at >= _dt(s), Order.ordered_at < _dt(e + timedelta(days=1)))
        .group_by(OrderItem.product_name).order_by(revenue.desc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("top_products", f"You had no completed sales in {_label(a.period)} ({s} to {e}), so there are no best sellers to show.",
                       ctx, period=(s, e), how="Groups your completed sales by product.", links=[], branch_scoped=True)
    best = rows[0]
    return _result("top_products", f"Your best seller for {_label(a.period)} is {best.product_name}: {format_money(best.rev, cur)} from {float(best.qty):g} sold.",
                   ctx, period=(s, e), branch_scoped=True,
                   how="Adds up what each product earned from your completed sales, using the exchange rate of the day each sale was made.",
                   links=[{"label": "Open Inventory", "href": "/inventory"}],
                   chart=_chart("Top products by sales", [r.product_name for r in rows], [r.rev for r in rows], cur),
                   table={"columns": ["Product", "Units sold", f"Sales ({cur})"], "rows": [[r.product_name, f"{float(r.qty):g}", format_money(r.rev, cur)] for r in rows]})


@tool("low_stock", "Products and variants at or below their reorder level (low vs out of stock).",
      module="inventory", permission="stock:read", args=LimitArgs)
async def low_stock(ctx: ToolContext, a: LimitArgs) -> dict[str, Any]:
    from app.modules.inventory.models.product import Product
    from app.modules.inventory.service.product import (
        low_stock_report,  # lazy: module packages import eagerly
    )

    report = await low_stock_report(ctx.db, ctx.tenant_id)
    total_active, with_min = (await ctx.db.execute(
        select(func.count(), func.count().filter(Product.min_stock > 0)).where(Product.tenant_id == ctx.tenant_id, Product.is_active.is_(True))
    )).one()
    note = ("Most of your products don't have a minimum stock level yet, so I can only spot a few shortages. "
            "Set a minimum on each product in Inventory to get better alerts.") if total_active and with_min < max(1, total_active // 2) else None
    links = [{"label": "View Inventory", "href": "/inventory"}]
    if not report.items:
        return _result("low_stock", "None of your products are running low right now.", ctx, heading="Stock levels look healthy", tone="positive",
                       how="Lists products whose stock has fallen to their minimum level or below.", links=links, note=note)
    lines = sorted(report.items, key=lambda x: x.stock - x.min_stock)[: a.limit]
    out = sum(1 for x in report.items if x.stock <= 0)
    low = report.total - out
    parts = ([f"{low} product{'s are' if low != 1 else ' is'} running low"] if low else []) + ([f"{out} product{'s are' if out != 1 else ' is'} out of stock"] if out else [])
    headline = " and ".join(parts) + "."
    return _result("low_stock", headline[0].upper() + headline[1:], ctx, heading="Low Stock Alert", tone="attention", note=note,
                   how="Compares what you have in stock with the minimum you set for each product. 'Out of stock' means none left; 'Low' means close to running out.",
                   links=links, metrics={"total": report.total, "out_of_stock": out, "low": low},
                   cards=[_card("Running low", low, "attention" if low else "neutral"), _card("Out of stock", out, "critical" if out else "neutral")],
                   followups=[{"label": "Suggest reorder quantities", "ask": "Which products should I reorder?"},
                              {"label": "Prepare Reorder Draft", "ask": "Prepare a purchase order for products likely to run out within 14 days."}],
                   table={"columns": ["Product", "Available", "Minimum", "Status"],
                          "rows": [[x.name, f"{x.stock:g}", f"{x.min_stock:g}", "Out of stock" if x.stock <= 0 else "Low"] for x in lines]})


@tool("receivables", "Money customers still owe: total and overdue outstanding, and the biggest debtors.",
      module="sales", permission="accounts_receivable:read", args=LimitArgs)
async def receivables(ctx: ToolContext, a: LimitArgs) -> dict[str, Any]:
    today = datetime.now(UTC).date()
    out = (Order.total - Order.amount_paid) * func.coalesce(Order.exchange_rate, 1)
    unpaid = [*_order_scope(ctx), Order.status == "Completed", Order.amount_paid < Order.total]
    tot = (await ctx.db.execute(select(
        func.coalesce(func.sum(out), 0), func.coalesce(func.sum(out).filter(Order.due_date < today), 0), func.count(),
    ).where(*unpaid))).one()
    debtors = (await ctx.db.execute(
        select(func.coalesce(Customer.name, "Walk-in / no customer"), func.sum(out).label("owed"), func.count().label("n"))
        .select_from(Order).outerjoin(Customer, Customer.id == Order.customer_id)
        .where(*unpaid).group_by(Customer.name).order_by(func.sum(out).desc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    total, overdue = to_decimal(tot[0]), to_decimal(tot[1])
    if tot[2] == 0:
        return _result("receivables", "No customers owe you anything right now.", ctx, how="Looks at completed sales that are not fully paid.",
                       links=[], branch_scoped=True)
    return _result("receivables", f"Customers owe you {format_money(total, cur)} across {tot[2]} unpaid invoice{'' if tot[2] == 1 else 's'}; {format_money(overdue, cur)} of that is overdue.",
                   ctx, branch_scoped=True, how="Takes the amount of each completed sale less what the customer has already paid, and adds up what is left.",
                   links=[{"label": "Open Receivables", "href": "/accounting/invoices"}], heading="Customer balances", tone="attention" if overdue > 0 else "neutral",
                   cards=[_card("Outstanding", format_money(total, cur)), _card("Overdue", format_money(overdue, cur), "critical" if overdue > 0 else "neutral"), _card("Unpaid invoices", tot[2])],
                   followups=[{"label": "Draft a payment reminder", "ask": f"Send a payment reminder to {debtors[0][0]}"}] if debtors and debtors[0][0] != "Walk-in / no customer" else [],
                   metrics={"outstanding": str(total), "overdue": str(overdue), "invoices": tot[2]},
                   table={"columns": ["Customer", "Unpaid invoices", f"Owes ({cur})"], "rows": [[d[0], d.n, format_money(d.owed, cur)] for d in debtors]})


@tool("expenses_summary", "Approved expenses for a period by category, compared with the previous period.",
      module="accounting", permission="journal_entries:read", args=PeriodArgs)
async def expenses_summary(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    s, e, ps, pe = resolve_period(a.period)
    amt = func.coalesce(Expense.base_amount, Expense.amount)
    base = [Expense.tenant_id == ctx.tenant_id, Expense.status == "Approved"]
    cur_rows = (await ctx.db.execute(
        select(Expense.category, func.sum(amt)).where(*base, Expense.expense_date >= s, Expense.expense_date <= e).group_by(Expense.category).order_by(func.sum(amt).desc())
    )).all()
    prev_total = to_decimal((await ctx.db.execute(
        select(func.coalesce(func.sum(amt), 0)).where(*base, Expense.expense_date >= ps, Expense.expense_date <= pe)
    )).scalar_one())
    cur = ctx.base_currency
    total = sum((to_decimal(r[1]) for r in cur_rows), Decimal(0))
    if not cur_rows:
        return _result("expenses_summary", f"You have no approved expenses for {_label(a.period)} ({s} to {e}).", ctx, period=(s, e),
                       how="Looks at approved expenses by the date they were incurred.", links=[{"label": "Open Expenses", "href": "/accounting/expenses"}])
    return _result("expenses_summary", f"You spent {format_money(total, cur)} on approved expenses ({_label(a.period)}). {_trend(total, prev_total, 'the period before')}",
                   ctx, period=(s, e), how="Adds up approved expenses by the date they were incurred, using the exchange rate of that day. Expenses are not split by branch.",
                   links=[{"label": "Open Expenses", "href": "/accounting/expenses"}],
                   chart=_chart("Approved expenses by category", [r[0] for r in cur_rows], [r[1] for r in cur_rows], cur),
                   cards=[_card("Expenses", format_money(total, cur), "attention" if total > prev_total > 0 else "neutral", _pct(total, prev_total)),
                          _card("Previous period", format_money(prev_total, cur))],
                   metrics={"total": str(total), "previous_total": str(prev_total)},
                   table={"columns": ["Category", f"Amount ({cur})"], "rows": [[r[0], format_money(r[1], cur)] for r in cur_rows]})


# ── help documentation ────────────────────────────────────────────────────────

class HelpArgs(_Args):
    question: str = Field(min_length=2, max_length=300)


@tool("help_docs", "Search the Pesaa help documentation to explain how Pesaa works or how to do something.",
      module=None, permission=None, args=HelpArgs)
async def help_docs(ctx: ToolContext, a: HelpArgs) -> dict[str, Any]:
    from app.core.config import settings
    from app.modules.ai.knowledge import search

    whatsapp = {"label": "Chat with Pesaa support on WhatsApp", "href": settings.SUPPORT_WHATSAPP_URL}
    found = search(a.question)
    wants_human = bool(re.search(r"\b(human|real person|whatsapp|customer support|support team|(talk|speak) to (a |an |the )?(person|someone|agent|human))\b", a.question.lower()))
    if not found:
        return _result("help_docs", "I'm not sure about that one, and I'd rather not guess. If you'd like a person to look into it, "
                       f"use the WhatsApp Support button or email {settings.SUPPORT_EMAIL}.", ctx,
                       how="I looked through the Pesaa guides but found nothing that matches.", links=[whatsapp] if wants_human else [])
    body = "\n\n".join(p.text for p in found)
    r = _result("help_docs", body[:1600], ctx, how="Taken from the Pesaa guide: " + ", ".join(sorted({p.title for p in found})) + ".",
                links=[{"label": f"Open {p.title}", "href": p.href} for p in found[:2]])
    if wants_human:
        r["links"].append(whatsapp)   # they asked for a person: always offer the human route
    r["passages"] = [{"doc": p.title, "text": p.text} for p in found]
    return r


# ── more read tools: customers, payables, reorder, purchasing, production, workforce ──

class InactiveArgs(_Args):
    days: int = Field(default=60, ge=7, le=365)
    limit: int = Field(default=10, ge=1, le=20)


class ReorderArgs(_Args):
    cover_days: int = Field(default=14, ge=3, le=90)
    limit: int = Field(default=10, ge=1, le=20)


@tool("top_customers", "Customers who spent the most in a period (names and totals only).", module="sales", permission="orders:read", args=TopProductsArgs)
async def top_customers(ctx: ToolContext, a: TopProductsArgs) -> dict[str, Any]:
    s, e, _, _ = resolve_period(a.period)
    spent = func.sum(func.coalesce(Order.base_total, Order.total))
    rows = (await ctx.db.execute(
        select(Customer.name, func.count().label("n"), spent.label("spent")).join(Customer, Customer.id == Order.customer_id)
        .where(*_order_scope(ctx), Order.status == "Completed", Order.ordered_at >= _dt(s), Order.ordered_at < _dt(e + timedelta(days=1)))
        .group_by(Customer.id, Customer.name).order_by(spent.desc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("top_customers", f"No customers bought from you in {_label(a.period)}.", ctx, period=(s, e), how="Groups your completed sales by customer.", links=[], branch_scoped=True)
    return _result("top_customers", f"Top customer for {_label(a.period)}: {rows[0].name} with {format_money(rows[0].spent, cur)} over {rows[0].n} orders.", ctx,
                   period=(s, e), branch_scoped=True, how="Adds up completed sales for each customer. Walk-in sales with no customer name are not counted.",
                   links=[{"label": "Open Customers", "href": "/customers"}],
                   chart=_chart("Top customers by spend", [r.name for r in rows], [r.spent for r in rows], cur),
                   table={"columns": ["Customer", "Orders", f"Spent ({cur})"], "rows": [[r.name, r.n, format_money(r.spent, cur)] for r in rows]})


@tool("inactive_customers", "Customers who bought before but have not purchased for a number of days (names only, no contact details).",
      module="sales", permission="orders:read", args=InactiveArgs)
async def inactive_customers(ctx: ToolContext, a: InactiveArgs) -> dict[str, Any]:
    cutoff = datetime.now(UTC) - timedelta(days=a.days)
    last = func.max(Order.ordered_at)
    rows = (await ctx.db.execute(
        select(Customer.name, last.label("last"), func.count().label("n"), func.sum(func.coalesce(Order.base_total, Order.total)).label("spent"))
        .join(Customer, Customer.id == Order.customer_id).where(*_order_scope(ctx), Order.status == "Completed")
        .group_by(Customer.id, Customer.name).having(last < cutoff).order_by(last.asc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("inactive_customers", f"Every returning customer has bought from you in the last {a.days} days.", ctx, branch_scoped=True,
                       how="Finds customers whose last purchase is older than the cut-off.", links=[])
    return _result("inactive_customers", f"{len(rows)} customer{'' if len(rows) == 1 else 's'} haven't bought for over {a.days} days. The longest silent is {rows[0].name}, who last bought on {rows[0].last.date()}.", ctx,
                   branch_scoped=True, how=f"Finds customers whose last purchase was more than {a.days} days ago. Contact details are kept private.",
                   links=[{"label": "Open Customers", "href": "/customers"}],
                   table={"columns": ["Customer", "Last order", "Orders", f"Lifetime ({cur})"], "rows": [[r.name, str(r.last.date()), r.n, format_money(r.spent, cur)] for r in rows]})


@tool("payables", "What the business owes suppliers: total unpaid supplier bills and the biggest suppliers owed.",
      module="procurement", permission="accounts_payable:read", args=LimitArgs)
async def payables(ctx: ToolContext, a: LimitArgs) -> dict[str, Any]:
    from app.modules.inventory.models.supplier import Supplier
    from app.modules.procurement.models.supplier_bill import SupplierBill

    owed = (SupplierBill.amount - SupplierBill.amount_paid) * func.coalesce(SupplierBill.exchange_rate, 1)
    unpaid = [SupplierBill.tenant_id == ctx.tenant_id, SupplierBill.amount_paid < SupplierBill.amount]
    tot = (await ctx.db.execute(select(func.coalesce(func.sum(owed), 0), func.count()).where(*unpaid))).one()
    rows = (await ctx.db.execute(
        select(func.coalesce(Supplier.name, "Unknown supplier"), func.sum(owed).label("owed"), func.count().label("n"))
        .select_from(SupplierBill).outerjoin(Supplier, Supplier.id == SupplierBill.supplier_id).where(*unpaid)
        .group_by(Supplier.name).order_by(func.sum(owed).desc()).limit(a.limit)
    )).all()
    cur = ctx.base_currency
    if tot[1] == 0:
        return _result("payables", "You don't owe any suppliers right now.", ctx, how="Looks at supplier bills that are not fully paid.", links=[])
    return _result("payables", f"You owe suppliers {format_money(tot[0], cur)} across {tot[1]} unpaid bill{'' if tot[1] == 1 else 's'}.", ctx,
                   how="Takes each supplier bill less what you have already paid, and adds up what is left.",
                   links=[{"label": "Open Purchases", "href": "/procurement/orders"}], metrics={"owed": str(to_decimal(tot[0])), "bills": tot[1]},
                   table={"columns": ["Supplier", "Unpaid bills", f"Owed ({cur})"], "rows": [[r[0], r.n, format_money(r.owed, cur)] for r in rows]})


async def reorder_candidates(ctx: ToolContext, cover_days: int, limit: int) -> list[tuple[Any, float, float, float | None]]:
    """(product row, suggested qty, sales/day, days of cover), most urgent first. Single source for the
    reorder recommendation AND the draft purchase order, so they can never disagree."""
    from app.modules.inventory.models.product import Product
    from app.modules.inventory.models.supplier import Supplier

    since = datetime.now(UTC) - timedelta(days=30)
    sold = (await ctx.db.execute(
        select(OrderItem.product_id, func.sum(OrderItem.quantity)).join(Order, Order.id == OrderItem.order_id)
        .where(*_order_scope(ctx), Order.status == "Completed", Order.ordered_at >= since, OrderItem.product_id.isnot(None)).group_by(OrderItem.product_id)
    )).all()
    velocity = {pid: float(q) / 30 for pid, q in sold}
    prods = (await ctx.db.execute(
        select(Product.id, Product.name, Product.sku, Product.stock, Product.min_stock, Product.cost, Supplier.lead_time_days)
        .outerjoin(Supplier, Supplier.id == Product.supplier_id)
        .where(Product.tenant_id == ctx.tenant_id, Product.is_active.is_(True), Product.has_variants.is_(False))
    )).all()
    recs = []
    for p in prods:
        stock, minimum, v = float(p.stock), float(p.min_stock), velocity.get(p.id, 0.0)
        cover = stock / v if v > 0 else None
        target_days = max(cover_days, p.lead_time_days or 0)   # never plan to cover less than the supplier takes to deliver
        need = max(minimum, v * target_days) - stock           # restore the minimum, or cover the target days of sales — whichever is more
        if need > 0 and (stock <= minimum or (cover is not None and cover < target_days)):
            recs.append((p, need, v, cover))
    recs.sort(key=lambda r: (r[3] if r[3] is not None else 0.0))
    return recs[:limit]


@tool("reorder_recommendations", "Products to reorder, from current stock, minimum stock and recent sales speed, with the working shown.",
      module="inventory", permission="stock:read", args=ReorderArgs)
async def reorder_recommendations(ctx: ToolContext, a: ReorderArgs) -> dict[str, Any]:
    recs = await reorder_candidates(ctx, a.cover_days, a.limit)
    if not recs:
        return _result("reorder_recommendations", f"Nothing needs reordering: every product has enough stock for the next {a.cover_days} days at your recent selling pace.", ctx,
                       how="Compares your stock with the minimum you set and how fast each product sold over the last 30 days.", links=[{"label": "Open Inventory", "href": "/inventory"}])
    return _result("reorder_recommendations", f"{len(recs)} product{' should' if len(recs) == 1 else 's should'} be reordered. The most urgent is {recs[0][0].name}.", ctx, branch_scoped=True,
                   heading="Reorder recommendations", tone="attention",
                   followups=[{"label": "Prepare Reorder Draft", "ask": f"Prepare a purchase order for products likely to run out within {a.cover_days} days."}],
                   how=f"Works out how many units you sell per day (last 30 days ÷ 30) and how many days your stock will last. "
                       f"The suggested quantity covers at least {a.cover_days} days of sales, or your minimum stock if that is higher, minus what you have now. "
                       f"Only products at or below their minimum, or with under {a.cover_days} days left, are listed. "
                       "If a supplier's delivery time is recorded, I plan for at least that many days; otherwise no delivery time is assumed.",
                   links=[{"label": "Open Inventory", "href": "/inventory"}],
                   table={"columns": ["Product", "In stock", "Sold / day", "Days of cover", "Suggested order"],
                          "rows": [[p.name, f"{float(p.stock):g}", f"{v:.2f}", "—" if c is None else f"{c:.1f}", f"{need:.0f}"] for p, need, v, c in recs]})


@tool("purchases_summary", "Purchase orders for a period by status with their base-currency value.", module="procurement", permission="purchase_orders:read", args=PeriodArgs)
async def purchases_summary(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    from app.modules.procurement.models.purchase_order import PurchaseOrder

    s, e, _, _ = resolve_period(a.period)
    rows = (await ctx.db.execute(
        select(PurchaseOrder.status, func.count(), func.coalesce(func.sum(func.coalesce(PurchaseOrder.base_total, PurchaseOrder.total)), 0))
        .where(PurchaseOrder.tenant_id == ctx.tenant_id, PurchaseOrder.created_at >= _dt(s), PurchaseOrder.created_at < _dt(e + timedelta(days=1)))
        .group_by(PurchaseOrder.status)
    )).all()
    cur = ctx.base_currency
    if not rows:
        return _result("purchases_summary", f"You placed no purchase orders in {_label(a.period)}.", ctx, period=(s, e), how="Groups your purchase orders by progress.", links=[])
    total = sum((to_decimal(r[2]) for r in rows), Decimal(0))
    n = sum(r[1] for r in rows)
    return _result("purchases_summary", f"You placed {n} purchase order{'' if n == 1 else 's'} worth {format_money(total, cur)} in {_label(a.period)} ({s} to {e}).", ctx, period=(s, e),
                   how="Adds up the purchase orders you placed in this period, using the exchange rate of the day each was placed.",
                   links=[{"label": "Open Purchases", "href": "/procurement/orders"}],
                   table={"columns": ["Status", "Orders", f"Value ({cur})"], "rows": [[r[0], r[1], format_money(r[2], cur)] for r in rows]})


@tool("production_status", "Production (work) orders by status.", module="manufacturing", permission="work_orders:read", args=_Args)
async def production_status(ctx: ToolContext, a: _Args) -> dict[str, Any]:
    from app.modules.manufacturing.models.production_order import ProductionOrder

    rows = (await ctx.db.execute(
        select(ProductionOrder.status, func.count(), func.coalesce(func.sum(ProductionOrder.quantity), 0))
        .where(ProductionOrder.tenant_id == ctx.tenant_id).group_by(ProductionOrder.status)
    )).all()
    if not rows:
        return _result("production_status", "You have no production jobs yet.", ctx, how="Groups your production jobs by progress.", links=[])
    open_n = sum(r[1] for r in rows if r[0] not in ("Completed", "Cancelled"))
    return _result("production_status", f"{open_n} production job{'' if open_n == 1 else 's'} still open out of {sum(r[1] for r in rows)} in total.", ctx, how="Groups all your production jobs by progress.",
                   links=[{"label": "Open Manufacturing", "href": "/manufacturing"}],
                   table={"columns": ["Status", "Orders", "Units planned"], "rows": [[r[0], r[1], f"{float(r[2]):g}"] for r in rows]})


@tool("workforce_summary", "Headcount, attendance totals and pending leave requests (aggregates only — no names, no pay).",
      module="hr", permission="attendance:read", args=PeriodArgs)
async def workforce_summary(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    from app.modules.hr.models.attendance import Attendance
    from app.modules.hr.models.employee import Employee
    from app.modules.hr.models.leave import LeaveRequest

    s, e, _, _ = resolve_period(a.period)
    staff = dict((await ctx.db.execute(select(Employee.employment_status, func.count()).where(Employee.tenant_id == ctx.tenant_id).group_by(Employee.employment_status))).all())
    att = (await ctx.db.execute(
        select(Attendance.status, func.count()).where(Attendance.tenant_id == ctx.tenant_id, Attendance.date >= s, Attendance.date <= e).group_by(Attendance.status)
    )).all()
    pending = (await ctx.db.execute(select(func.count()).where(LeaveRequest.tenant_id == ctx.tenant_id, LeaveRequest.status == "Pending"))).scalar_one()
    if not staff:
        return _result("workforce_summary", "You have no staff recorded yet.", ctx, how="Based on your staff records.", links=[])
    return _result("workforce_summary", f"{sum(staff.values())} employees ({staff.get('Active', 0)} active). {pending} leave requests are waiting for approval.", ctx,
                   period=(s, e), how="Shows headcount only. Staff names, pay and personal reasons are kept private.", links=[{"label": "Open HR", "href": "/hr"}],
                   table={"columns": ["Attendance status", "Records"], "rows": [[r[0], r[1]] for r in att]} if att else None)


@tool("services_summary", "Service business activity in a period: completed appointments and walk-ins per service, with estimated revenue from service prices.",
      module="services", permission="services:read", args=PeriodArgs)
async def services_summary(ctx: ToolContext, a: PeriodArgs) -> dict[str, Any]:
    from app.modules.services.models.appointment import Appointment, AppointmentService
    from app.modules.services.models.queue_entry import QueueEntry
    from app.modules.services.models.service import Service

    s, e, _, _ = resolve_period(a.period)
    lo, hi = _dt(s), _dt(e + timedelta(days=1))
    appt = (await ctx.db.execute(
        select(AppointmentService.service_name, func.count(), func.coalesce(func.sum(AppointmentService.price), 0))
        .join(Appointment, Appointment.id == AppointmentService.appointment_id)
        .where(Appointment.tenant_id == ctx.tenant_id, Appointment.status == "completed", Appointment.scheduled_start >= lo, Appointment.scheduled_start < hi,
               *([Appointment.branch_id == ctx.branch_id] if ctx.branch_id else []))
        .group_by(AppointmentService.service_name)
    )).all()
    walk = (await ctx.db.execute(
        select(QueueEntry.service_name, func.count(), func.coalesce(func.sum(Service.price), 0))
        .outerjoin(Service, Service.id == QueueEntry.service_id)
        .where(QueueEntry.tenant_id == ctx.tenant_id, QueueEntry.status == "completed", QueueEntry.completed_at >= lo, QueueEntry.completed_at < hi,
               *([QueueEntry.branch_id == ctx.branch_id] if ctx.branch_id else []))
        .group_by(QueueEntry.service_name)
    )).all()
    merged: dict[str, list[Any]] = {}
    for name, n, rev in [*appt, *walk]:
        row = merged.setdefault(name, [0, Decimal(0)])
        row[0] += n
        row[1] += to_decimal(rev)
    cur = ctx.base_currency
    if not merged:
        return _result("services_summary", f"No completed services in {_label(a.period)} ({s} to {e}).", ctx, period=(s, e), branch_scoped=True,
                       how="Looks at finished appointments and walk-in customers.", links=[{"label": "Open Services", "href": "/services"}])
    ranked = sorted(merged.items(), key=lambda kv: kv[1][1], reverse=True)[:10]
    total = sum((v[1] for v in merged.values()), Decimal(0))
    count = sum(v[0] for v in merged.values())
    return _result("services_summary", f"You completed {count} service{'' if count == 1 else 's'} in {_label(a.period)}, worth about {format_money(total, cur)}. Your top earner is {ranked[0][0]} ({format_money(ranked[0][1][1], cur)}).",
                   ctx, period=(s, e), branch_scoped=True,
                   how="Adds up finished appointments and walk-in customers at your service prices. This is an estimate, not taken from invoices.",
                   links=[{"label": "Open Services", "href": "/services"}],
                   chart=_chart("Estimated revenue by service", [k for k, _ in ranked], [v[1] for _, v in ranked], cur),
                   table={"columns": ["Service", "Completed", f"Est. revenue ({cur})"], "rows": [[k, v[0], format_money(v[1], cur)] for k, v in ranked]})


# ── access + execution ────────────────────────────────────────────────────────

async def _tool_allowed(ctx: ToolContext, t: Tool) -> bool:
    return (t.permission is None or ctx.can(t.permission)) and (t.module is None or await feature_enabled(ctx.db, ctx.tenant_id, t.module))


async def allowed_tools(ctx: ToolContext) -> list[Tool]:
    """Tools this user may use right now (module enabled for the tenant + permission held)."""
    out: list[Tool] = []
    for t in REGISTRY.values():
        if await _tool_allowed(ctx, t):
            out.append(t)
    return out


def _compact(schema: Any) -> Any:
    """Drop schema noise the model doesn't need (pydantic's `title`s) — tool definitions are re-sent with every
    request, so every character costs tokens (and, on rate-limited plans, quota)."""
    if isinstance(schema, dict):
        return {k: _compact(v) for k, v in schema.items() if k != "title"}
    if isinstance(schema, list):
        return [_compact(v) for v in schema]
    return schema


def specs_for(tools: list[Tool]) -> list[ToolSpec]:
    return [ToolSpec(t.name, t.description, _compact(t.args_model.model_json_schema())) for t in tools]


_ALWAYS = {"help_docs", "sales_summary", "business_overview", "navigate", "about_me"}


# Words that make a tool worth offering for a question, so the model sees the handful of relevant tools instead of every one.
_TOPIC_WORDS: dict[str, str] = {
    "sales_summary": r"sale|sell|sold|revenue|turnover|income|today|takings",
    "compare_sales": r"compar|versus|\bvs\b|than last|growth|decline|better|worse",
    "revenue_trend": r"trend|over time|growth|daily|monthly|weekly|performance",
    "profit_summary": r"profit|margin|earn|loss|net |gross",
    "top_products": r"top|best|product|item|popular",
    "top_customers": r"customer|client|buyer",
    "new_customers": r"new customer|new client|signed up|joined|acquired",
    "inactive_customers": r"inactive|stopped|haven.?t (bought|purchased)|not (bought|purchased)|lost customer|churn",
    "receivables": r"owe me|owes me|owed|receivable|debt|outstanding|overdue",
    "unpaid_invoices": r"invoice|unpaid|overdue|owe",
    "expenses_summary": r"expense|spend|spent|cost|rent|salary|bill",
    "payables": r"supplier|owe|payable|bill|debt",
    "unpaid_bills": r"unpaid|bill|owe|supplier|purchase",
    "purchases_summary": r"purchase|buying|bought|supplier|order",
    "supplier_spend": r"supplier|vendor|buy from|purchase from|most",
    "low_stock": r"low|stock|running out|out of stock|inventory",
    "inventory_value": r"inventory|stock|worth|value",
    "slow_moving_products": r"slow|not selling|dead|idle|stale|stuck|inventory|stock",
    "reorder_recommendations": r"reorder|restock|order more|run out|need to buy",
    "production_status": r"production|manufactur|work order",
    "workforce_summary": r"staff|employee|workforce|attendance|leave|headcount|payroll",
    "services_summary": r"service|appointment|booking",
    "find_products": r"price|cost of|how much .* (do we|have)|stock of|most expensive|cheapest|list .*product|which product|product (called|named)|sku|barcode|most stock|least stock",
    "find_customers": r"customer|client|buyer|bought|spent",
    "find_suppliers": r"supplier|vendor|delivery time|lead time",
    "orders_overview": r"order|pending|cancel|status",
    "about_me": r"\bwho\b.*\b(i|me|logged|signed)\b|\bwho am\b|my (name|role|branch|business|account)|which (branch|business|company)|where am i|logged in|signed in",
    "how_many": r"how many|number of|count|total (products|customers|suppliers|staff|employees)",
    "business_overview": r"business|performing|performance|doing|overview|summary|health|check",
}


def focus_tools(tools: list[Tool], module: str, question: str = "") -> list[Tool]:
    # The page the user is on is context, never a restriction: they can ask about anything from anywhere. Only the
    # wording of the question narrows what is offered (cheaper and more accurate); no clear match offers everything.
    q = question.lower()
    if not q:
        return tools
    matched = [t for t in tools if re.search(_TOPIC_WORDS.get(t.name, "$^"), q)]
    if not matched:
        return tools  # e.g. a follow-up like "what about last month?": offer everything
    return [t for t in tools if t in matched or t.kind == "draft" or t.name in _ALWAYS]


async def run_tool(ctx: ToolContext, name: str, raw_args: dict[str, Any]) -> dict[str, Any]:
    """Execute one tool call from the model, re-checking every guard. Raises ToolError, never leaks internals."""
    t = REGISTRY.get(name)
    if t is None:
        raise ToolError("I can't help with that request.")
    if t.permission is not None and not ctx.can(t.permission):
        raise ToolError("You don't have permission to do or see that.")
    if t.module is not None and not await feature_enabled(ctx.db, ctx.tenant_id, t.module):
        raise ToolError("That part of Pesaa isn't enabled for your business.")
    try:
        args = t.args_model.model_validate(raw_args or {})
    except ValidationError as exc:
        # Includes any attempt to pass tenant_id / branch_id / user_id: extras are forbidden.
        raise ToolError("I need a bit more detail to do that. Could you rephrase your request?") from exc
    return await t.handler(ctx, args)


from app.modules.ai import (  # noqa: F401  (register the business-intelligence and navigation tools)
    tools_insights,
    tools_nav,
)
