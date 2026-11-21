"""One SQL snapshot of posted branch activity; no client-side list aggregation."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, cast, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.models.account import Account
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.warehouse import StockMovement, Warehouse
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_payment import OrderPayment

# The owner's daily sheet: per branch and day. Stock value is a closing balance and is added separately (stock_values).
METRICS = ("sales", "customer_credit", "expenses", "deposits", "bank", "momo")
# How a customer payment's method is read: cash stays out; mobile money (MTN MoMo, Airtel Money, ...) is MoMo; any other
# non-cash method (bank transfer, card, cheque) lands in the bank.
CASH_METHODS = ("cash",)
MOMO_PATTERNS = ("%mobile%", "%momo%", "%mtn%", "%airtel%")


class DailyRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def outstanding_debt(self, tenant_id: uuid.UUID, branches: list[uuid.UUID] | None):
        stmt = select(func.coalesce(func.sum(
            func.greatest(Order.total - Order.amount_paid, 0) * func.coalesce(Order.exchange_rate, 1)
        ), 0)).where(Order.tenant_id == tenant_id, Order.status == "Completed")
        if branches is not None:
            stmt = stmt.where(Order.branch_id.in_(branches))
        return (await self.db.execute(stmt)).scalar_one()

    async def activity(self, tenant_id: uuid.UUID, branches: list[uuid.UUID] | None,
                       start: datetime, end: datetime, timezone: str,
                       first: date, last: date, offset: int = 0, limit: int = 25) -> list[dict]:
        def event(model, at, metric, amount, status, join=None, calendar=False, extra=()):
            day = at if calendar else cast(func.timezone(timezone, at), Date)
            values = [amount if name == metric else literal(0) for name in METRICS]
            stmt = select(day.label("day"), model.branch_id.label("branch_id"),
                          *(value.label(name) for name, value in zip(METRICS, values)))
            if join:
                stmt = stmt.select_from(model).join(join[0], join[1])
            stmt = stmt.where(model.tenant_id == tenant_id, status, *extra,
                              at >= (first if calendar else start), at < (last if calendar else end))
            if branches is not None:
                stmt = stmt.where(model.branch_id.in_(branches))
            return stmt

        rate = func.coalesce(Order.exchange_rate, 1)
        paid = func.coalesce(OrderPayment.base_amount, OrderPayment.amount * func.coalesce(OrderPayment.exchange_rate, 1))
        sources = [
            event(Order, Order.ordered_at, "sales", func.coalesce(Order.base_total, Order.total * rate), Order.status == "Completed"),
            event(Order, func.coalesce(Order.credit_granted_at, Order.ordered_at), "customer_credit", func.coalesce(Order.credit_base, 0), Order.status == "Completed"),
            event(Expense, Expense.expense_date, "expenses", func.coalesce(Expense.base_amount, Expense.amount * func.coalesce(Expense.exchange_rate, 1)), Expense.status == "Approved", calendar=True),
            # Deposit: cash taken out of a cash account (codes 100x) by an account-to-account transfer, i.e. banked or sent to MoMo.
            event(Transaction, Transaction.transaction_date, "deposits", TransactionLine.amount, Transaction.status == "Posted",
                  (TransactionLine, TransactionLine.transaction_id == Transaction.id), calendar=True,
                  extra=(Transaction.type == "cash_transfer", TransactionLine.type == "credit",
                         TransactionLine.account_id.in_(select(Account.id).where(Account.tenant_id == tenant_id, Account.code.like("100%"))))),
            # Bank and MoMo: customer payments received by bank transfer or card, and by mobile money, kept apart.
            event(OrderPayment, OrderPayment.paid_at, "bank", paid, OrderPayment.status == "Completed",
                  extra=(OrderPayment.payment_method.is_not(None), func.lower(OrderPayment.payment_method).not_in(CASH_METHODS),
                         *(func.lower(OrderPayment.payment_method).not_like(p) for p in MOMO_PATTERNS))),
            event(OrderPayment, OrderPayment.paid_at, "momo", paid, OrderPayment.status == "Completed",
                  extra=(or_(*(func.lower(OrderPayment.payment_method).like(p) for p in MOMO_PATTERNS)),)),
        ]
        rows = union_all(*sources).cte("events")
        stmt = select(rows.c.day, rows.c.branch_id, *(func.sum(rows.c[name]).label(name) for name in METRICS)).group_by(rows.c.day, rows.c.branch_id).order_by(rows.c.day.desc(), rows.c.branch_id)
        grouped = stmt.order_by(None).subquery()
        stmt = select(grouped, func.count().over().label("row_count"), *(
            func.sum(grouped.c[name]).over().label(f"total_{name}") for name in METRICS
        )).order_by(grouped.c.day.desc(), grouped.c.branch_id).offset(offset).limit(limit)
        return [dict(row) for row in (await self.db.execute(stmt)).mappings()]

    async def stock_values(self, tenant_id: uuid.UUID, branches: list[uuid.UUID] | None, start: datetime, end: datetime,
                           timezone: str, days: list[date]) -> dict[tuple[date, uuid.UUID | None], Decimal]:
        """Closing stock value per branch at the end of each day: the stock ledger up to that moment x today's cost price.
        Movements are append-only, so replaying them gives the quantity at any point in time."""
        value = StockMovement.quantity * func.coalesce(Product.cost, 0)
        base = (select(Warehouse.branch_id, func.coalesce(func.sum(value), 0)).select_from(StockMovement)
                .join(Warehouse, Warehouse.id == StockMovement.warehouse_id).join(Product, Product.id == StockMovement.product_id)
                .where(StockMovement.tenant_id == tenant_id))
        if branches is not None:
            base = base.where(Warehouse.branch_id.in_(branches))
        opening = {r[0]: Decimal(r[1]) for r in (await self.db.execute(base.where(StockMovement.created_at < start).group_by(Warehouse.branch_id))).all()}
        local_day = cast(func.timezone(timezone, StockMovement.created_at), Date)
        changes = (await self.db.execute(base.add_columns(local_day).where(StockMovement.created_at >= start, StockMovement.created_at < end)
                                         .group_by(Warehouse.branch_id, local_day))).all()
        by_day: dict[date, dict] = {}
        for branch_id, amount, day in changes:
            by_day.setdefault(day, {})[branch_id] = Decimal(amount)
        running, out = dict(opening), {}
        for day in sorted(days):
            for branch_id, amount in by_day.get(day, {}).items():
                running[branch_id] = running.get(branch_id, Decimal(0)) + amount
            for branch_id, amount in running.items():
                out[(day, branch_id)] = amount
        return out
