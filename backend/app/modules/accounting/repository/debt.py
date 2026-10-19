"""Bounded, tenant-scoped debt projections and SQL aggregates; no parallel debt ledger."""

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import Date, Select, String, and_, case, cast, func, literal, or_, select, union_all

from app.core.repository import BaseRepository
from app.modules.accounting.schemas.debt import DebtFilters, DebtKind
from app.modules.inventory.models.supplier import Supplier
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.supplier_bill import SupplierBill, SupplierPayment
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_payment import OrderPayment


class DebtRepository(BaseRepository[Order]):
    model = Order

    def projection(
        self,
        tenant_id: uuid.UUID,
        kind: DebtKind,
        currency: str,
        branch_id: uuid.UUID | None,
        today: date,
    ) -> Select:
        payable = kind == "payable"
        source = SupplierBill if payable else Order
        amount = source.amount if payable else source.total
        paid = source.amount_paid
        balance = func.greatest(amount - paid, 0)
        status = case((balance <= 0, "Paid"), (paid > 0, "PartiallyPaid"), else_="Unpaid")
        overdue = and_(balance > 0, source.due_date < today)
        name = Supplier.name if payable else Customer.name
        stmt = (
            select(
                source.id,
                literal(kind).label("kind"),
                func.coalesce(
                    name, "Supplier not specified" if payable else "Customer not specified"
                ).label("name"),
                (source.reference if payable else source.order_number).label("reference"),
                amount.label("original"),
                paid.label("paid"),
                balance.label("outstanding"),
                func.round(balance * func.coalesce(source.exchange_rate, 1), 2).label("base_outstanding"),
                func.coalesce(source.currency_code, currency).label("currency"),
                (source.bill_date if payable else cast(source.ordered_at, Date)).label(
                    "issue_date"
                ),
                source.due_date,
                status.label("status"),
                func.coalesce(overdue, False).label("is_overdue"),
            )
            .select_from(source)
            .where(source.tenant_id == tenant_id)
        )
        if payable:
            stmt = (
                stmt.join(
                    PurchaseOrder,
                    and_(
                        PurchaseOrder.id == source.purchase_order_id,
                        PurchaseOrder.tenant_id == tenant_id,
                    ),
                )
                .outerjoin(
                    Supplier,
                    and_(
                        Supplier.id == source.supplier_id,
                        Supplier.tenant_id == tenant_id,
                    ),
                )
                .where(PurchaseOrder.status == "Received")
            )
            if branch_id:
                stmt = stmt.where(PurchaseOrder.branch_id == branch_id)
        else:
            stmt = stmt.outerjoin(
                Customer,
                and_(
                    Customer.id == source.customer_id,
                    Customer.tenant_id == tenant_id,
                ),
            ).where(
                source.status == "Completed",
                or_(
                    source.credit_base > 0,
                    source.total > source.amount_paid,
                    source.due_date.is_not(None),
                    func.lower(source.payment_method).in_(["credit", "invoice"]),
                ),
            )
            if branch_id:
                stmt = stmt.where(source.branch_id == branch_id)
        return stmt

    def filtered(self, stmt: Select, filters: DebtFilters) -> Any:
        rows = stmt.subquery()
        query = select(rows)
        if filters.search:
            term = (
                "%"
                + filters.search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                + "%"
            )
            query = query.where(
                or_(rows.c.name.ilike(term, escape="\\"), rows.c.reference.ilike(term, escape="\\"))
            )
        if filters.status:
            query = (
                query.where(rows.c.is_overdue.is_(True))
                if filters.status == "Overdue"
                else query.where(rows.c.status == filters.status)
            )
        if filters.due_from:
            query = query.where(rows.c.due_date >= filters.due_from)
        if filters.due_to:
            query = query.where(rows.c.due_date <= filters.due_to)
        return query.subquery()

    async def summary(self, rows: Any) -> dict[str, str | int]:
        result = (
            (
                await self.db.execute(
                    select(
                        func.count().label("total"),
                        func.coalesce(func.sum(rows.c.base_outstanding), 0).label("outstanding"),
                        func.coalesce(
                            func.sum(case((rows.c.is_overdue, rows.c.base_outstanding), else_=0)), 0
                        ).label("overdue"),
                    ).select_from(rows)
                )
            )
            .mappings()
            .one()
        )
        return {
            "total": result["total"],
            "outstanding": str(Decimal(result["outstanding"]).quantize(Decimal("0.01"))),
            "overdue": str(Decimal(result["overdue"]).quantize(Decimal("0.01"))),
        }

    async def page(self, rows: Any, offset: int, limit: int) -> list[dict]:
        result = await self.db.execute(
            select(rows)
            .order_by(
                rows.c.is_overdue.desc(),
                rows.c.due_date.asc().nulls_last(),
                rows.c.id,
            )
            .offset(offset)
            .limit(limit)
        )
        return [dict(row) for row in result.mappings()]

    async def upcoming(self, projections: list[Select], limit: int = 10) -> list[dict]:
        rows = union_all(*projections).subquery()
        result = await self.db.execute(
            select(rows)
            .where(
                rows.c.outstanding > 0,
                rows.c.due_date.is_not(None),
            )
            .order_by(rows.c.due_date, rows.c.kind, rows.c.id)
            .limit(limit)
        )
        return [dict(row) for row in result.mappings()]

    async def history(
        self,
        tenant_id: uuid.UUID,
        kind: DebtKind,
        document_id: uuid.UUID,
        offset: int,
        limit: int,
    ) -> tuple[list[dict], int]:
        from app.modules.audit.models import AuditLog
        from app.modules.tenants.models import User

        payable = kind == "payable"
        model = SupplierPayment if payable else OrderPayment
        key = model.bill_id if payable else model.order_id
        where = (model.tenant_id == tenant_id, key == document_id)
        total = await self.db.scalar(select(func.count()).select_from(model).where(*where))
        columns = [
            model.id,
            model.reference,
            model.amount,
            model.currency_code,
            model.payment_method,
            model.paid_at,
        ]
        if payable:
            # Legacy DEBT references are retry keys. Number payments by creation order,
            # independently of payment dates and history pagination, for a readable label.
            sequence = func.row_number().over(
                partition_by=model.bill_id, order_by=(model.created_at, model.id),
            )
            columns += [
                case(
                    (model.reference.like("DEBT-%"),
                     literal("Payment ") + cast(sequence, String)),
                    else_=model.reference,
                ).label("display_reference"),
                literal("Completed").label("status"),
                literal(None).label("actor"),
                literal(None).label("notes"),
                literal(None).label("reference_number"),
            ]
        else:
            columns += [
                model.status,
                User.full_name.label("actor"),
                model.notes,
                model.reference_number,
            ]
        history_query = select(*columns).where(*where)
        if not payable:
            history_query = history_query.outerjoin(
                User, and_(User.id == model.received_by, User.tenant_id == tenant_id)
            )
        rows = [
            dict(row)
            for row in (
                await self.db.execute(
                    history_query.order_by(
                        model.paid_at.desc(),
                        model.id.desc(),
                    )
                    .offset(offset)
                    .limit(limit)
                )
            ).mappings()
        ]
        if payable and rows:
            # Fetch metadata for the current page in one batch, never per payment.
            ids = [str(row["id"]) for row in rows]
            logs = (
                await self.db.execute(
                    select(AuditLog.entity_id, AuditLog.actor_name, AuditLog.changes).where(
                        AuditLog.tenant_id == tenant_id,
                        AuditLog.entity_type == "supplier_payment",
                        AuditLog.action == "supplier_payment.create",
                        AuditLog.entity_id.in_(ids),
                    )
                )
            ).all()
            metadata = {str(row.entity_id): row for row in logs}
            for row in rows:
                entry = metadata.get(str(row["id"]))
                if entry:
                    row["actor"] = entry.actor_name
                    row["notes"] = (entry.changes or {}).get("notes")
                    row["reference_number"] = (entry.changes or {}).get("reference_number")
        return rows, total or 0

    async def one(self, projection: Select, document_id: uuid.UUID) -> dict | None:
        rows = projection.subquery()
        row = (
            (await self.db.execute(select(rows).where(rows.c.id == document_id))).mappings().first()
        )
        return dict(row) if row else None

    async def payment_metadata(self, tenant_id: uuid.UUID, payment_id: uuid.UUID) -> dict:
        from app.modules.audit.models import AuditLog

        value = await self.db.scalar(
            select(AuditLog.changes)
            .where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.entity_type == "supplier_payment",
                AuditLog.entity_id == str(payment_id),
                AuditLog.action == "supplier_payment.create",
            )
            .limit(1)
        )
        return value or {}

    async def payment_key(self, tenant_id: uuid.UUID, kind: DebtKind, key: str) -> Any:
        model = SupplierPayment if kind == "payable" else OrderPayment
        identity = (
            model.reference == "DEBT-" + key
            if kind == "payable"
            else model.client_payment_id == key
        )
        return (
            await self.db.execute(
                select(model).where(
                    model.tenant_id == tenant_id,
                    identity,
                )
            )
        ).scalar_one_or_none()

    async def draft_purchases(
        self, tenant_id: uuid.UUID, branch_id: uuid.UUID | None, offset: int, limit: int,
    ) -> tuple[list[dict[str, Any]], int]:
        query = select(
            PurchaseOrder.id, PurchaseOrder.reference, PurchaseOrder.total,
            PurchaseOrder.currency_code.label("currency"), Supplier.name.label("supplier"),
        ).join(Supplier, and_(Supplier.id == PurchaseOrder.supplier_id,
                                  Supplier.tenant_id == tenant_id)).where(
            PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.status == "Draft",
            PurchaseOrder.supplier_id.is_not(None),
        )
        if branch_id:
            query = query.where(PurchaseOrder.branch_id == branch_id)
        total = (await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        rows = await self.db.execute(query.order_by(PurchaseOrder.created_at.desc(), PurchaseOrder.id)
                                     .offset(offset).limit(limit))
        return [dict(row) for row in rows.mappings()], total

    async def lock_purchase(
        self, tenant_id: uuid.UUID, branch_id: uuid.UUID | None, purchase_id: uuid.UUID,
    ) -> PurchaseOrder | None:
        query = select(PurchaseOrder).join(
            Supplier, and_(Supplier.id == PurchaseOrder.supplier_id, Supplier.tenant_id == tenant_id),
        ).where(
            PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.id == purchase_id,
        )
        if branch_id:
            query = query.where(PurchaseOrder.branch_id == branch_id)
        return (await self.db.execute(query.with_for_update())).scalar_one_or_none()

    async def bill_for_purchase(
        self, tenant_id: uuid.UUID, purchase_id: uuid.UUID,
    ) -> uuid.UUID | None:
        return (await self.db.execute(select(SupplierBill.id).where(
            SupplierBill.tenant_id == tenant_id, SupplierBill.purchase_order_id == purchase_id,
        ))).scalar_one_or_none()
