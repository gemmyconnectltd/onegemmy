"""One SQL snapshot of posted branch activity; no client-side list aggregation."""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, cast, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.models.expense import Expense
from app.modules.manufacturing.models.production_item import ProductionItem
from app.modules.manufacturing.models.production_order import ProductionOrder
from app.modules.procurement.models.purchase_item import PurchaseItem
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.order_payment import OrderPayment

METRICS = ("sales", "customer_credit", "collections", "expenses", "stock_in", "stock_out", "production", "materials_consumed", "wastage")


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
                       first: date, last: date, offset: int = 0, limit: int = 25, include_production: bool = False) -> list[dict]:
        def event(model, at, metric, amount, status, join=None, calendar=False):
            day = at if calendar else cast(func.timezone(timezone, at), Date)
            values = [amount if name == metric else literal(0) for name in METRICS]
            stmt = select(day.label("day"), model.branch_id.label("branch_id"),
                          *(value.label(name) for name, value in zip(METRICS, values)))
            if join:
                stmt = stmt.select_from(model).join(join[0], join[1])
            stmt = stmt.where(model.tenant_id == tenant_id, status,
                              at >= (first if calendar else start), at < (last if calendar else end))
            if branches is not None:
                stmt = stmt.where(model.branch_id.in_(branches))
            return stmt

        rate = func.coalesce(Order.exchange_rate, 1)
        sources = [
            event(Order, Order.ordered_at, "sales", func.coalesce(Order.base_total, Order.total * rate), Order.status == "Completed"),
            event(Order, func.coalesce(Order.credit_granted_at, Order.ordered_at), "customer_credit", func.coalesce(Order.credit_base, 0), Order.status == "Completed"),
            event(OrderPayment, OrderPayment.paid_at, "collections", func.coalesce(OrderPayment.base_amount, OrderPayment.amount * func.coalesce(OrderPayment.exchange_rate, 1)), OrderPayment.status == "Completed"),
            event(Expense, Expense.expense_date, "expenses", func.coalesce(Expense.base_amount, Expense.amount * func.coalesce(Expense.exchange_rate, 1)), Expense.status == "Approved", calendar=True),
            event(PurchaseOrder, PurchaseOrder.received_at, "stock_in", PurchaseItem.quantity, PurchaseOrder.status == "Received", (PurchaseItem, PurchaseItem.purchase_order_id == PurchaseOrder.id)),
            event(Order, Order.ordered_at, "stock_out", OrderItem.quantity, Order.status == "Completed", (OrderItem, OrderItem.order_id == Order.id)),
        ]
        if include_production:
            sources.extend([
                event(ProductionOrder, ProductionOrder.completed_at, "production", ProductionOrder.quantity, ProductionOrder.status == "Completed"),
                event(ProductionOrder, ProductionOrder.completed_at, "materials_consumed", ProductionItem.quantity_required + ProductionItem.wastage_quantity, ProductionOrder.status == "Completed", (ProductionItem, ProductionItem.production_order_id == ProductionOrder.id)),
                event(ProductionOrder, ProductionOrder.completed_at, "wastage", ProductionItem.wastage_quantity, ProductionOrder.status == "Completed", (ProductionItem, ProductionItem.production_order_id == ProductionOrder.id)),
            ])
        rows = union_all(*sources).cte("events")
        stmt = select(rows.c.day, rows.c.branch_id, *(func.sum(rows.c[name]).label(name) for name in METRICS)).group_by(rows.c.day, rows.c.branch_id).order_by(rows.c.day.desc(), rows.c.branch_id)
        grouped = stmt.order_by(None).subquery()
        stmt = select(grouped, func.count().over().label("row_count"), *(
            func.sum(grouped.c[name]).over().label(f"total_{name}") for name in METRICS
        )).order_by(grouped.c.day.desc(), grouped.c.branch_id).offset(offset).limit(limit)
        return [dict(row) for row in (await self.db.execute(stmt)).mappings()]
