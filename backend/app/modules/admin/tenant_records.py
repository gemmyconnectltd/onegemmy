import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Literal

from sqlalchemy import (
    DateTime,
    Numeric,
    String,
    and_,
    case,
    cast,
    func,
    literal,
    or_,
    select,
    union_all,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import CompoundSelect, Select

from app.core.pagination import PageParams
from app.modules.accounting.models.debt import ManualDebt
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.models.transaction import Transaction
from app.modules.approvals.models import ApprovalRequest
from app.modules.audit.models.audit import AuditLog
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.supplier import Supplier
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.supplier_bill import SupplierBill, SupplierPayment
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_payment import OrderPayment

TenantRecordSection = Literal[
    "sales", "customers", "inventory", "purchases", "payments", "debts",
    "expenses", "accounting", "approvals", "activity",
]

def _record(
    *,
    section: str,
    entity_id: ColumnElement[Any],
    reference: ColumnElement[Any] | None,
    title: ColumnElement[Any] | None,
    status: ColumnElement[Any] | None,
    recorded_at: ColumnElement[Any],
    counterparty: ColumnElement[Any] | None = None,
    amount: ColumnElement[Any] | None = None,
    currency: ColumnElement[Any] | None = None,
    detail: ColumnElement[Any] | None = None,
) -> Select[Any]:
    return select(
        cast(entity_id, String).label("id"),
        literal(section, type_=String()).label("section"),
        cast(reference, String).label("reference"),
        cast(title, String).label("title"),
        cast(status, String).label("status"),
        cast(recorded_at, DateTime(timezone=True)).label("recorded_at"),
        cast(counterparty, String).label("counterparty"),
        cast(amount, Numeric(14, 2)).label("amount"),
        cast(currency, String).label("currency"),
        cast(detail, String).label("detail"),
    )


def _tenant_records(
    tenant_id: uuid.UUID, currency: str, section: TenantRecordSection,
) -> Select[Any] | CompoundSelect[Any]:
    if section == "sales":
        return (
            _record(
                section=section, entity_id=Order.id, reference=Order.order_number,
                title=Order.order_number, status=Order.status, recorded_at=Order.ordered_at,
                counterparty=Customer.name, amount=Order.total, currency=Order.currency_code,
                detail=Order.payment_method,
            )
            .select_from(Order)
            .outerjoin(Customer, and_(Customer.id == Order.customer_id, Customer.tenant_id == tenant_id))
            .where(Order.tenant_id == tenant_id)
        )
    if section == "customers":
        return (
            _record(
                section=section, entity_id=Customer.id, reference=Customer.customer_type,
                title=Customer.name, status=case((Customer.is_active.is_(True), "Active"), else_="Inactive"),
                recorded_at=Customer.created_at, detail=Customer.customer_type,
            )
            .where(Customer.tenant_id == tenant_id)
        )
    if section == "inventory":
        return (
            _record(
                section=section, entity_id=Product.id, reference=Product.sku,
                title=Product.name, status=case((Product.is_active.is_(True), "Active"), else_="Inactive"),
                recorded_at=Product.created_at, amount=Product.price, currency=currency,
                detail=Product.stock,
            )
            .where(Product.tenant_id == tenant_id)
        )
    if section == "purchases":
        return (
            _record(
                section=section, entity_id=PurchaseOrder.id, reference=PurchaseOrder.reference,
                title=PurchaseOrder.reference, status=PurchaseOrder.status, recorded_at=PurchaseOrder.created_at,
                counterparty=Supplier.name, amount=PurchaseOrder.total, currency=PurchaseOrder.currency_code,
            )
            .select_from(PurchaseOrder)
            .outerjoin(Supplier, and_(Supplier.id == PurchaseOrder.supplier_id, Supplier.tenant_id == tenant_id))
            .where(PurchaseOrder.tenant_id == tenant_id)
        )
    if section == "payments":
        sales_payments = (
            _record(
                section="Sales payment", entity_id=OrderPayment.id, reference=OrderPayment.reference,
                title=OrderPayment.reference, status=OrderPayment.status, recorded_at=OrderPayment.paid_at,
                counterparty=Customer.name, amount=OrderPayment.amount, currency=OrderPayment.currency_code,
                detail=OrderPayment.payment_method,
            )
            .select_from(OrderPayment)
            .outerjoin(Customer, and_(Customer.id == OrderPayment.customer_id, Customer.tenant_id == tenant_id))
            .where(OrderPayment.tenant_id == tenant_id)
        )
        supplier_payments = (
            _record(
                section="Supplier payment", entity_id=SupplierPayment.id, reference=SupplierPayment.reference,
                title=SupplierPayment.reference, status=literal("Completed", type_=String()), recorded_at=SupplierPayment.paid_at,
                counterparty=Supplier.name, amount=SupplierPayment.amount, currency=SupplierPayment.currency_code,
                detail=literal("Supplier payment", type_=String()),
            )
            .select_from(SupplierPayment)
            .join(SupplierBill, and_(SupplierBill.id == SupplierPayment.bill_id, SupplierBill.tenant_id == tenant_id))
            .outerjoin(Supplier, and_(Supplier.id == SupplierBill.supplier_id, Supplier.tenant_id == tenant_id))
            .where(SupplierPayment.tenant_id == tenant_id)
        )
        return union_all(sales_payments, supplier_payments)
    if section == "debts":
        sales_debts = (
            _record(
                section="Sales receivable", entity_id=Order.id, reference=Order.order_number,
                title=Order.order_number, status=literal("Outstanding", type_=String()),
                recorded_at=func.coalesce(cast(Order.due_date, DateTime(timezone=True)), Order.ordered_at),
                counterparty=Customer.name, amount=Order.total - Order.amount_paid,
                currency=Order.currency_code, detail=literal("Customer balance", type_=String()),
            )
            .select_from(Order)
            .outerjoin(Customer, and_(Customer.id == Order.customer_id, Customer.tenant_id == tenant_id))
            .where(Order.tenant_id == tenant_id, Order.total > Order.amount_paid, Order.archived_at.is_(None))
        )
        supplier_debts = (
            _record(
                section="Supplier payable", entity_id=SupplierBill.id, reference=SupplierBill.reference,
                title=SupplierBill.reference, status=SupplierBill.status,
                recorded_at=func.coalesce(
                    cast(SupplierBill.due_date, DateTime(timezone=True)),
                    cast(SupplierBill.bill_date, DateTime(timezone=True)),
                ),
                counterparty=Supplier.name, amount=SupplierBill.amount - SupplierBill.amount_paid,
                currency=SupplierBill.currency_code, detail=literal("Supplier balance", type_=String()),
            )
            .select_from(SupplierBill)
            .outerjoin(Supplier, and_(Supplier.id == SupplierBill.supplier_id, Supplier.tenant_id == tenant_id))
            .where(SupplierBill.tenant_id == tenant_id, SupplierBill.amount > SupplierBill.amount_paid)
        )
        manual_debts = (
            _record(
                section="Manual debt", entity_id=ManualDebt.id, reference=ManualDebt.reference,
                title=ManualDebt.kind, status=literal("Outstanding", type_=String()),
                recorded_at=func.coalesce(
                    cast(ManualDebt.due_date, DateTime(timezone=True)),
                    cast(ManualDebt.issue_date, DateTime(timezone=True)),
                ),
                counterparty=func.coalesce(Customer.name, Supplier.name),
                amount=ManualDebt.amount - ManualDebt.amount_paid, currency=ManualDebt.currency_code,
                detail=literal("Opening balance", type_=String()),
            )
            .select_from(ManualDebt)
            .outerjoin(Customer, and_(Customer.id == ManualDebt.customer_id, Customer.tenant_id == tenant_id))
            .outerjoin(Supplier, and_(Supplier.id == ManualDebt.supplier_id, Supplier.tenant_id == tenant_id))
            .where(ManualDebt.tenant_id == tenant_id, ManualDebt.amount > ManualDebt.amount_paid)
        )
        return union_all(sales_debts, supplier_debts, manual_debts)
    if section == "expenses":
        return (
            _record(
                section=section, entity_id=Expense.id, reference=Expense.reference,
                title=Expense.title, status=Expense.status, recorded_at=Expense.expense_date,
                amount=Expense.amount, currency=Expense.currency_code, detail=Expense.category,
            )
            .where(Expense.tenant_id == tenant_id)
        )
    if section == "accounting":
        return (
            _record(
                section=section, entity_id=Transaction.id, reference=Transaction.reference,
                title=Transaction.description, status=Transaction.status, recorded_at=Transaction.transaction_date,
                amount=None, currency=Transaction.currency_code, detail=Transaction.type,
            )
            .where(Transaction.tenant_id == tenant_id)
        )
    if section == "approvals":
        requests = _record(
            section=section, entity_id=ApprovalRequest.id, reference=ApprovalRequest.kind,
            title=ApprovalRequest.title, status=ApprovalRequest.status, recorded_at=ApprovalRequest.created_at,
            counterparty=ApprovalRequest.requested_by_name, detail=ApprovalRequest.reason,
        ).where(ApprovalRequest.tenant_id == tenant_id)
        credit_sales = _record(
            section=section, entity_id=Order.id, reference=Order.order_number,
            title=Order.order_number, status=Order.status, recorded_at=Order.ordered_at,
            counterparty=Customer.name, amount=Order.total, currency=Order.currency_code,
            detail=Order.approval_note,
        ).select_from(Order).outerjoin(
            Customer, and_(Customer.id == Order.customer_id, Customer.tenant_id == tenant_id)
        ).where(Order.tenant_id == tenant_id, Order.status == "Awaiting Approval")
        return union_all(requests, credit_sales)
    if section == "activity":
        return (
            _record(
                section=section, entity_id=AuditLog.id, reference=AuditLog.action,
                title=AuditLog.summary, status=AuditLog.entity_type, recorded_at=AuditLog.created_at,
                counterparty=AuditLog.actor_name, detail=AuditLog.entity_id,
            )
            .where(AuditLog.tenant_id == tenant_id)
        )
    raise ValueError(f"Unsupported tenant record section: {section}")


async def list_tenant_records(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    currency: str,
    section: TenantRecordSection,
    page: PageParams,
    search: str | None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[dict[str, Any]], int]:
    records = _tenant_records(tenant_id, currency, section).subquery()
    filters = []
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(or_(
            records.c.reference.ilike(term),
            records.c.title.ilike(term),
            records.c.status.ilike(term),
            records.c.counterparty.ilike(term),
        ))
    if status and status.strip():
        filters.append(records.c.status.ilike(status.strip()))
    if date_from:
        filters.append(records.c.recorded_at >= datetime.combine(date_from, time.min, tzinfo=UTC))
    if date_to:
        filters.append(
            records.c.recorded_at
            < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
        )
    statement = select(records).where(*filters)
    total = await db.scalar(select(func.count()).select_from(statement.subquery()))
    rows = (await db.execute(
        statement.order_by(records.c.recorded_at.desc().nullslast(), records.c.id)
        .offset(page.offset).limit(page.limit)
    )).mappings().all()
    return [dict(row) for row in rows], int(total or 0)
