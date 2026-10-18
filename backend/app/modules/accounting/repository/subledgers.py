import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, String, and_, cast, func, literal, or_, select, union_all

from app.core.exceptions import ValidationError
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.supplier import Supplier
from app.modules.inventory.models.variant import ProductVariant
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.supplier_bill import SupplierBill, SupplierPayment
from app.modules.sales.models.customer import Customer
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_payment import OrderPayment


class SubledgerRepository(ReportingRepository):
    async def aging(self, tenant_id: uuid.UUID, as_of: date, payable: bool, branch_id: uuid.UUID | None = None):
        if payable:
            model, pay = SupplierBill, SupplierPayment
            paid = select(pay.bill_id.label("document_id"), func.sum(func.coalesce(pay.applied_amount, pay.amount)).label("paid"), func.count().label("payments")).where(
                pay.tenant_id == tenant_id, cast(pay.paid_at, Date) <= as_of).group_by(pay.bill_id).subquery()
            total = model.amount
            outstanding = func.greatest(total - func.coalesce(paid.c.paid, 0), 0)
            stmt = select(model.id, model.reference, model.bill_date.label("date"), model.due_date,
                          func.coalesce(Supplier.name, "Supplier not specified").label("name"),
                          outstanding.label("outstanding"), model.currency_code, model.exchange_rate,
                          model.amount_paid.label("original_paid"), model.amount.label("document_total"), paid.c.payments).select_from(model).join(
                PurchaseOrder, and_(PurchaseOrder.id == model.purchase_order_id, PurchaseOrder.tenant_id == tenant_id)
            ).outerjoin(Supplier, and_(Supplier.id == model.supplier_id, Supplier.tenant_id == tenant_id)).outerjoin(paid, paid.c.document_id == model.id).where(
                model.tenant_id == tenant_id, model.bill_date <= as_of, PurchaseOrder.status == "Received")
            if branch_id:
                stmt = stmt.where(PurchaseOrder.branch_id == branch_id)
        else:
            model, pay = Order, OrderPayment
            paid = select(pay.order_id.label("document_id"), func.sum(func.coalesce(pay.applied_amount, pay.amount)).label("paid"), func.count().label("payments")).where(
                pay.tenant_id == tenant_id, cast(pay.paid_at, Date) <= as_of,
                or_(pay.status == "Completed", and_(pay.status == "Reversed", cast(pay.reversed_at, Date) > as_of)),
            ).group_by(pay.order_id).subquery()
            outstanding = func.greatest(model.total - func.coalesce(paid.c.paid, 0), 0)
            stmt = select(model.id, model.order_number.label("reference"), cast(model.ordered_at, Date).label("date"), model.due_date,
                          func.coalesce(Customer.name, "Walk-in customer").label("name"), outstanding.label("outstanding"),
                          model.currency_code, model.exchange_rate, model.amount_paid.label("original_paid"), model.total.label("document_total"), paid.c.payments).select_from(model).outerjoin(
                Customer, and_(Customer.id == model.customer_id, Customer.tenant_id == tenant_id)
            ).outerjoin(paid, paid.c.document_id == model.id).where(model.tenant_id == tenant_id, model.status == "Completed", cast(model.ordered_at, Date) <= as_of)
            if branch_id:
                stmt = stmt.where(model.branch_id == branch_id)
        # Compare the complete payment trail with the current source balance before reconstructing history.
        document_key = pay.bill_id if payable else pay.order_id
        known_stmt = select(document_key.label("document_id"), func.sum(func.coalesce(pay.applied_amount, pay.amount)).label("known_paid")).where(pay.tenant_id == tenant_id)
        if not payable:
            known_stmt = known_stmt.where(pay.status == "Completed")
        known = known_stmt.group_by(document_key).subquery()
        stmt = stmt.add_columns(func.coalesce(known.c.known_paid, 0).label("known_paid")).outerjoin(known, known.c.document_id == model.id)
        stream = await self.db.stream(stmt.order_by(model.id).execution_options(yield_per=100))
        from datetime import UTC, datetime
        today = datetime.now(UTC).date()
        async for row in stream:
            # Current values remain authoritative for old documents whose payment trail predates payments.
            amount = Decimal(row.outstanding)
            if Decimal(row.original_paid or 0) != Decimal(row.known_paid):
                if as_of != today:
                    raise ValidationError("Historical payment detail is missing for a legacy document; generate current aging or reconcile its payment history first")
                amount = max(Decimal(row.document_total) - Decimal(row.original_paid), Decimal(0))
            if amount <= 0:
                continue
            days = max((as_of - row.due_date).days, 0) if row.due_date else 0
            bucket = "current" if days == 0 else "days_1_30" if days <= 30 else "days_31_60" if days <= 60 else "days_61_90" if days <= 90 else "over_90"
            rate = Decimal(row.exchange_rate or 1)
            base = (amount * rate).quantize(Decimal("0.01"))
            yield {"id": str(row.id), "reference": row.reference, "date": row.date.isoformat(),
                   "name": row.name, "due_date": row.due_date.isoformat() if row.due_date else None,
                   "amount": str(base), "document_amount": str(amount), "document_currency": row.currency_code,
                   "age": days, "bucket": bucket, "status": "Overdue" if days else "Current", "due_note": "Due date precedes issue date; review terms" if row.due_date and row.due_date < row.date else "" if row.due_date else "No due date"}

    async def inventory(self, tenant_id: uuid.UUID):
        parent = select(Product.id.label("id"), Product.id.label("product_id"), Product.name.label("name"),
                        Product.sku.label("code"), Product.stock.label("quantity"), Product.cost.label("unit_cost"),
                        literal("Product").label("kind")).where(Product.tenant_id == tenant_id, or_(Product.has_variants.is_(False), ~select(ProductVariant.id).where(ProductVariant.product_id == Product.id).exists()))
        variants = select(ProductVariant.id, Product.id, (Product.name + literal(" · ") + func.coalesce(ProductVariant.sku, cast(ProductVariant.id, String))).label("name"),
                          func.coalesce(ProductVariant.sku, Product.sku), ProductVariant.stock, ProductVariant.cost, literal("Variant")).join(
            Product, Product.id == ProductVariant.product_id).where(Product.tenant_id == tenant_id, Product.has_variants.is_(True), ProductVariant.is_active.is_(True))
        stmt = union_all(parent, variants).subquery()
        stream = await self.db.stream(select(stmt).order_by(stmt.c.name, stmt.c.id).execution_options(yield_per=100))
        async for row in stream:
            yield {"id": str(row.id), "product_id": str(row.product_id), "name": row.name, "code": row.code or "—",
                   "quantity": str(row.quantity), "unit_cost": str(row.unit_cost),
                   "amount": str((Decimal(row.quantity) * Decimal(row.unit_cost)).quantize(Decimal("0.01"))), "status": row.kind}
