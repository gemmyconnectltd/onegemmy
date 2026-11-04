"""Read-only product traceability: UNION ALL over authoritative source records.

No stock is posted here. Missing historical balances and actors remain null.
"""

import uuid
from typing import Any

from sqlalchemy import (
    Numeric,
    String,
    and_,
    case,
    cast,
    func,
    literal,
    null,
    or_,
    select,
    union_all,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.period import DatePeriod
from app.modules.audit.models import AuditLog
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.transfer import StockTransfer as Transfer
from app.modules.inventory.models.transfer import StockTransferItem as TransferItem
from app.modules.inventory.models.variant import ProductVariant
from app.modules.procurement.models.goods_receipt import GoodsReceipt, GoodsReceiptLine
from app.modules.procurement.models.purchase_item import PurchaseItem
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.purchase_return import PurchaseReturn
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.return_ import Return
from app.modules.sales.models.return_item import ReturnItem
from app.modules.tenants.models import Branch, User


def _event(
    kind: str,
    category: str,
    id: Any,
    date: Any,
    reference: Any,
    source_id: Any,
    source: str,
    branch: Any = None,
    actor: Any = None,
    quantity: Any = None,
    change: Any = None,
    status: Any = None,
    details: Any = None,
    other_branch: Any = None,
):
    return select(
        (literal(kind + ":") + cast(id, String)).label("id"),
        literal(kind).label("type"),
        literal(category).label("category"),
        date.label("occurred_at"),
        reference.label("reference"),
        cast(source_id, String).label("source_id"),
        literal(source).label("source"),
        (branch if branch is not None else cast(null(), Branch.id.type)).label("branch_id"),
        (other_branch if other_branch is not None else cast(null(), Branch.id.type)).label(
            "other_branch_id"
        ),
        (actor if actor is not None else cast(null(), User.id.type)).label("actor_id"),
        cast(quantity if quantity is not None else null(), Numeric).label("quantity"),
        cast(change if change is not None else null(), Numeric).label("quantity_change"),
        (status if status is not None else literal(None, String)).label("status"),
        (details if details is not None else cast(literal("{}"), JSONB)).label("details"),
    )


class ProductHistoryRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def events(
        self,
        tenant_id: uuid.UUID,
        product_id: uuid.UUID,
        modules: set[str],
        *,
        sales_only: bool = False,
    ):
        variants = select(ProductVariant.id).where(ProductVariant.product_id == product_id)

        def matches(model):
            return or_(model.product_id == product_id, model.variant_id.in_(variants))

        audit_category = case(
            (AuditLog.action == "product.price", "prices"),
            (AuditLog.action.in_(["product.adjusted", "product.restocked"]), "movements"),
            else_="updates",
        )
        audits = _event(
            "product_event",
            "updates",
            AuditLog.id,
            AuditLog.created_at,
            literal(None, String),
            AuditLog.entity_id,
            "product",
            actor=AuditLog.actor_user_id,
            change=cast(AuditLog.changes["after"]["stock"].astext, Numeric)
            - cast(AuditLog.changes["before"]["stock"].astext, Numeric),
            details=func.jsonb_build_object(
                "action",
                AuditLog.action,
                "summary",
                AuditLog.summary,
                "changes",
                AuditLog.changes,
                "actor_name",
                AuditLog.actor_name,
            ),
        )
        # Replace only category; the columns remain the same across every source.
        cols = list(audits.selected_columns)
        cols[2] = audit_category.label("category")
        audits = select(*cols).where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.entity_type == "product",
            AuditLog.entity_id == str(product_id),
        )
        # A legacy creation timestamp is reliable, but its initial configuration/actor is not.
        legacy_creation = _event(
            "product_created",
            "updates",
            Product.id,
            Product.created_at,
            literal(None, String),
            Product.id,
            "product",
            details=func.jsonb_build_object(
                "note", "Creation timestamp only; initial values and performer were not recorded"
            ),
        )
        legacy_creation = legacy_creation.where(
            Product.tenant_id == tenant_id,
            Product.id == product_id,
            ~select(AuditLog.id)
            .where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.entity_type == "product",
                AuditLog.entity_id == str(product_id),
                AuditLog.action == "product.created",
            )
            .exists(),
        )
        parts = [audits, legacy_creation]
        sales_parts = []
        if "sales" in modules:
            sales_parts.append(
                _event(
                    "sale",
                    "movements",
                    OrderItem.id,
                    Order.ordered_at,
                    Order.order_number,
                    Order.id,
                    "sale",
                    Order.branch_id,
                    Order.created_by,
                    OrderItem.quantity,
                    case((Order.status == "Completed", -OrderItem.quantity), else_=None),
                    Order.status,
                    func.jsonb_build_object(
                        "unit_price",
                        OrderItem.unit_price,
                        "total",
                        OrderItem.line_total,
                        "currency",
                        Order.currency_code,
                        "customer_id",
                        Order.customer_id,
                    ),
                )
                .select_from(OrderItem)
                .join(Order, Order.id == OrderItem.order_id)
                .where(Order.tenant_id == tenant_id, matches(OrderItem))
            )
            sales_parts.append(
                _event(
                    "customer_return",
                    "returns",
                    ReturnItem.id,
                    Return.created_at,
                    Return.return_number,
                    Return.order_id,
                    "sale",
                    Order.branch_id,
                    Return.processed_by,
                    ReturnItem.quantity,
                    case((Return.status == "Approved", ReturnItem.quantity), else_=None),
                    Return.status,
                    func.jsonb_build_object(
                        "reason", Return.reason, "original_reference", Order.order_number
                    ),
                )
                .select_from(ReturnItem)
                .join(Return, Return.id == ReturnItem.return_id)
                .join(Order, and_(Order.id == Return.order_id, Order.tenant_id == tenant_id))
                .outerjoin(
                    OrderItem,
                    and_(OrderItem.id == ReturnItem.order_item_id, OrderItem.order_id == Order.id),
                )
                .where(
                    Return.tenant_id == tenant_id,
                    or_(ReturnItem.product_id == product_id, matches(OrderItem)),
                )
            )
        if sales_only:
            return union_all(*sales_parts).subquery()
        parts.extend(sales_parts)
        if "procurement" in modules:
            parts.append(
                _event(
                    "purchase",
                    "purchases",
                    PurchaseItem.id,
                    PurchaseOrder.created_at,
                    PurchaseOrder.reference,
                    PurchaseOrder.id,
                    "purchase",
                    PurchaseOrder.branch_id,
                    PurchaseOrder.created_by,
                    PurchaseItem.quantity,
                    status=PurchaseOrder.status,
                    details=func.jsonb_build_object(
                        "received_quantity",
                        PurchaseItem.received_quantity,
                        "unit_cost",
                        PurchaseItem.unit_cost,
                        "currency",
                        PurchaseOrder.currency_code,
                        "supplier_id",
                        PurchaseOrder.supplier_id,
                        "stock_factor",
                        PurchaseItem.stock_factor,
                    ),
                )
                .select_from(PurchaseItem)
                .join(PurchaseOrder, PurchaseOrder.id == PurchaseItem.purchase_order_id)
                .where(PurchaseOrder.tenant_id == tenant_id, matches(PurchaseItem))
            )
            parts.append(
                _event(
                    "receipt",
                    "movements",
                    GoodsReceiptLine.id,
                    GoodsReceipt.received_at,
                    GoodsReceipt.reference,
                    PurchaseOrder.id,
                    "purchase",
                    GoodsReceipt.branch_id,
                    GoodsReceipt.received_by,
                    GoodsReceiptLine.quantity,
                    GoodsReceiptLine.quantity * PurchaseItem.stock_factor,
                    literal("Received"),
                    func.jsonb_build_object(
                        "purchase_reference",
                        PurchaseOrder.reference,
                        "stock_factor",
                        PurchaseItem.stock_factor,
                    ),
                )
                .select_from(GoodsReceiptLine)
                .join(GoodsReceipt, GoodsReceipt.id == GoodsReceiptLine.receipt_id)
                .join(PurchaseItem, PurchaseItem.id == GoodsReceiptLine.purchase_item_id)
                .join(
                    PurchaseOrder,
                    and_(
                        PurchaseOrder.id == GoodsReceipt.purchase_order_id,
                        PurchaseItem.purchase_order_id == PurchaseOrder.id,
                    ),
                )
                .where(
                    GoodsReceipt.tenant_id == tenant_id,
                    PurchaseOrder.tenant_id == tenant_id,
                    matches(PurchaseItem),
                    PurchaseItem.is_service.is_(False),
                )
            )
            parts.append(
                _event(
                    "supplier_return",
                    "returns",
                    PurchaseReturn.id,
                    PurchaseReturn.created_at,
                    PurchaseReturn.reference,
                    PurchaseOrder.id,
                    "purchase",
                    PurchaseOrder.branch_id,
                    PurchaseReturn.processed_by,
                    PurchaseReturn.quantity,
                    status=PurchaseReturn.status,
                    details=func.jsonb_build_object(
                        "reason",
                        PurchaseReturn.reason,
                        "note",
                        "Stock units and reversal timestamps are unavailable in this legacy record",
                    ),
                )
                .select_from(PurchaseReturn)
                .join(PurchaseOrder, PurchaseOrder.id == PurchaseReturn.purchase_order_id)
                .where(
                    PurchaseReturn.tenant_id == tenant_id,
                    PurchaseOrder.tenant_id == tenant_id,
                    matches(PurchaseReturn),
                )
            )
        parts.append(
            _event(
                "transfer",
                "transfers",
                TransferItem.id,
                Transfer.created_at,
                Transfer.transfer_number,
                Transfer.id,
                "transfer",
                Transfer.from_branch_id,
                Transfer.created_by,
                TransferItem.quantity,
                literal(0),
                Transfer.status,
                func.jsonb_build_object(
                    "notes", Transfer.notes, "completed_at", Transfer.completed_at
                ),
                Transfer.to_branch_id,
            )
            .select_from(TransferItem)
            .join(Transfer, Transfer.id == TransferItem.transfer_id)
            .where(Transfer.tenant_id == tenant_id, matches(TransferItem))
        )
        if "procurement" in modules:
            price = (
                func.jsonb_array_elements(AuditLog.changes["price_changes"])
                .table_valued("value", with_ordinality="ordinality")
                .lateral()
            )
            value = cast(price.c.value, JSONB)
            parts.append(
                _event(
                    "purchase_price",
                    "prices",
                    cast(AuditLog.id, String) + literal(":") + cast(price.c.ordinality, String),
                    AuditLog.created_at,
                    PurchaseOrder.reference,
                    PurchaseOrder.id,
                    "purchase",
                    PurchaseOrder.branch_id,
                    AuditLog.actor_user_id,
                    details=func.jsonb_build_object(
                        "changes",
                        func.jsonb_build_object(
                            "before",
                            func.jsonb_build_object(
                                "price", value["previous_price"], "cost", value["previous_cost"]
                            ),
                            "after",
                            func.jsonb_build_object(
                                "price", value["new_price"], "cost", value["new_cost"]
                            ),
                        ),
                        "variant_id",
                        value["variant_id"],
                    ),
                )
                .select_from(AuditLog)
                .join(
                    PurchaseOrder,
                    and_(
                        cast(PurchaseOrder.id, String) == AuditLog.entity_id,
                        PurchaseOrder.tenant_id == tenant_id,
                    ),
                )
                .join(price, literal(True))
                .where(
                    AuditLog.tenant_id == tenant_id,
                    AuditLog.action == "purchase.receive",
                    value["product_id"].astext == str(product_id),
                )
            )
        return union_all(*parts).subquery()

    def filtered(
        self,
        events,
        branches: list[uuid.UUID] | None,
        period: DatePeriod,
        search: str | None,
        actor_id: uuid.UUID | None,
        branch_id: uuid.UUID | None,
    ):
        stmt = select(events)
        if branches is not None:
            # Both endpoints must be authorized: a transfer must not leak another branch.
            stmt = stmt.where(
                events.c.branch_id.in_(branches),
                or_(events.c.other_branch_id.is_(None), events.c.other_branch_id.in_(branches)),
            )
        if branch_id:
            stmt = stmt.where(
                or_(events.c.branch_id == branch_id, events.c.other_branch_id == branch_id)
            )
        if actor_id:
            stmt = stmt.where(events.c.actor_id == actor_id)
        if search:
            stmt = stmt.where(events.c.reference.ilike(f"%{search}%"))
        return period.apply(stmt, events.c.occurred_at)

    async def page(self, stmt, category: str, kind: str | None, offset: int, limit: int) -> dict:
        all_rows = stmt.subquery()
        counts = dict(
            (
                await self.db.execute(
                    select(all_rows.c.category, func.count()).group_by(all_rows.c.category)
                )
            ).all()
        )
        filtered = self.selection(all_rows, category, kind)
        total = await self.db.scalar(select(func.count()).select_from(filtered.subquery()))
        rows = (
            (
                await self.db.execute(
                    filtered.order_by(all_rows.c.occurred_at.desc(), all_rows.c.id.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .mappings()
            .all()
        )
        return {"items": [dict(row) for row in rows], "total": total, "counts": counts}

    async def sold(self, stmt) -> Any:
        rows = stmt.subquery()
        # The signed impacts use exactly the sales posting states, not invoice creation.
        return await self.db.scalar(
            select(func.coalesce(-func.sum(rows.c.quantity_change), 0)).where(
                rows.c.type.in_(["sale", "customer_return"])
            )
        )

    async def labels(self, tenant_id: uuid.UUID, rows: list[dict]) -> None:
        from app.modules.inventory.models.supplier import Supplier
        from app.modules.sales.models.customer import Customer

        branch_ids = {r[key] for r in rows for key in ("branch_id", "other_branch_id") if r[key]}
        actor_ids = {r["actor_id"] for r in rows if r["actor_id"]}
        branch_names = (
            dict(
                (
                    await self.db.execute(
                        select(Branch.id, Branch.name).where(
                            Branch.tenant_id == tenant_id, Branch.id.in_(branch_ids)
                        )
                    )
                ).all()
            )
            if branch_ids
            else {}
        )
        actor_names = (
            dict(
                (
                    await self.db.execute(
                        select(User.id, User.full_name).where(
                            User.tenant_id == tenant_id, User.id.in_(actor_ids)
                        )
                    )
                ).all()
            )
            if actor_ids
            else {}
        )
        for model, key in ((Customer, "customer_id"), (Supplier, "supplier_id")):
            ids = {uuid.UUID(r["details"][key]) for r in rows if r["details"].get(key)}
            names = (
                dict(
                    (
                        await self.db.execute(
                            select(model.id, model.name).where(
                                model.tenant_id == tenant_id, model.id.in_(ids)
                            )
                        )
                    ).all()
                )
                if ids
                else {}
            )
            for row in rows:
                id = row["details"].get(key)
                if id:
                    row["details"][key.replace("_id", "")] = names.get(uuid.UUID(id))
        for row in rows:
            row["branch"] = branch_names.get(row["branch_id"])
            row["other_branch"] = branch_names.get(row["other_branch_id"])
            row["actor"] = actor_names.get(row["actor_id"]) or row["details"].get("actor_name")

    @staticmethod
    def selection(all_rows, category: str, kind: str | None):
        filtered = select(all_rows)
        if category != "all":
            filtered = filtered.where(all_rows.c.category == category)
        if kind:
            if kind == "adjustment":
                filtered = filtered.where(
                    all_rows.c.type == "product_event",
                    all_rows.c.details["action"].astext.in_(
                        ["product.adjusted", "product.restocked"]
                    ),
                )
            else:
                filtered = filtered.where(all_rows.c.type == kind)
        return filtered
