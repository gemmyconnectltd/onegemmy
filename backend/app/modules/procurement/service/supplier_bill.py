import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.service.transaction import (
    create_purchase_transaction,
    create_supplier_payment_transaction,
)
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.supplier_bill import SupplierBill, SupplierPayment
from app.modules.procurement.repository import SupplierBillRepository, SupplierPaymentRepository
from app.modules.procurement.schemas.supplier_bill import (
    SupplierBillRead,
    SupplierPaymentCreate,
    SupplierPaymentRead,
)


def _to_read(obj: SupplierBill) -> SupplierBillRead:
    read = SupplierBillRead.model_validate(obj)
    read.po_reference = obj.purchase_order.reference if obj.purchase_order else None
    read.supplier_name = obj.supplier.name if obj.supplier else (obj.purchase_order.supplier.name if obj.purchase_order and obj.purchase_order.supplier else None)
    read.balance = round(float(obj.amount) - float(obj.amount_paid), 2)
    return read


async def list_bills(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[SupplierBillRead]:
    items = await SupplierBillRepository(db).list_for_tenant(tenant_id, status, offset, limit)
    return [_to_read(i) for i in items]


async def count_bills(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None) -> int:
    return await SupplierBillRepository(db).count_for_tenant(tenant_id, status)


async def get_bill(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> SupplierBillRead:
    obj = await SupplierBillRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Supplier bill not found")
    return _to_read(obj)


async def create_bill_for_purchase(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, purchase: PurchaseOrder) -> SupplierBill:
    """Called when a Purchase Order is received — raises the supplier bill
    (the actual liability) and posts Dr Inventory / Cr Accounts Payable.
    Does not commit; the caller (receive_purchase/_apply_receive) does."""
    repo = SupplierBillRepository(db)
    reference = await repo.next_reference(tenant_id)
    bill = SupplierBill(
        tenant_id=tenant_id,
        reference=reference,
        purchase_order_id=purchase.id,
        supplier_id=purchase.supplier_id,
        amount=purchase.total,
        amount_paid=0,
        status="Unpaid",
        bill_date=datetime.now(UTC).date(),
        created_by=user_id,
    )
    bill = await repo.save(bill)
    await create_purchase_transaction(db, tenant_id, user_id, purchase.id, float(purchase.total), purchase.reference)
    return bill


async def record_payment(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, bill_id: uuid.UUID, data: SupplierPaymentCreate) -> SupplierBillRead:
    bill_repo = SupplierBillRepository(db)
    bill = await bill_repo.get_by_id_for_tenant(tenant_id, bill_id)
    if bill is None:
        raise NotFoundError("Supplier bill not found")
    if bill.status == "Paid":
        raise ValidationError("This bill is already fully paid")

    balance = round(float(bill.amount) - float(bill.amount_paid), 2)
    if data.amount > balance + 0.01:
        raise ValidationError(f"Payment of {data.amount} exceeds the remaining balance of {balance}")

    payment_repo = SupplierPaymentRepository(db)
    reference = await payment_repo.next_reference(tenant_id)
    payment = SupplierPayment(
        tenant_id=tenant_id,
        reference=reference,
        bill_id=bill.id,
        amount=data.amount,
        payment_method=data.payment_method,
        paid_at=datetime.now(UTC),
        created_by=user_id,
    )
    db.add(payment)

    bill.amount_paid = round(float(bill.amount_paid) + data.amount, 2)
    bill.status = "Paid" if bill.amount_paid >= float(bill.amount) - 0.01 else "PartiallyPaid"
    await bill_repo.save(bill)

    await create_supplier_payment_transaction(
        db, tenant_id, user_id, bill.purchase_order_id, data.amount, reference, data.payment_method,
    )

    await db.commit()
    obj = await bill_repo.get_by_id_for_tenant(tenant_id, bill_id)
    return _to_read(obj)


async def list_payments(db: AsyncSession, tenant_id: uuid.UUID, bill_id: uuid.UUID) -> list[SupplierPaymentRead]:
    payments = await SupplierPaymentRepository(db).list_for_bill(tenant_id, bill_id)
    return [SupplierPaymentRead.model_validate(p) for p in payments]
