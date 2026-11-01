import uuid

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.procurement.models.supplier_bill import SupplierBill, SupplierPayment


def _with_relations():
    return [
        selectinload(SupplierBill.purchase_order).selectinload(PurchaseOrder.supplier),
        selectinload(SupplierBill.supplier),
    ]


class SupplierBillRepository(BaseRepository[SupplierBill]):
    model = SupplierBill

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> SupplierBill | None:
        result = await self.db.execute(
            select(SupplierBill).options(*_with_relations())
            .where(SupplierBill.id == id, SupplierBill.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50, branch_id=None, order_id=None) -> list[SupplierBill]:
        stmt = select(SupplierBill).options(*_with_relations()).where(SupplierBill.tenant_id == tenant_id)
        if branch_id:
            stmt = stmt.join(PurchaseOrder, (PurchaseOrder.id == SupplierBill.purchase_order_id) & (PurchaseOrder.tenant_id == tenant_id)).where(PurchaseOrder.branch_id == branch_id)
        if order_id:
            stmt = stmt.where(SupplierBill.purchase_order_id == order_id)
        if status:
            stmt = stmt.where(SupplierBill.status == status)
        stmt = stmt.order_by(SupplierBill.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, branch_id=None, order_id=None) -> int:
        stmt = select(func.count()).select_from(SupplierBill).where(SupplierBill.tenant_id == tenant_id)
        if branch_id:
            stmt = stmt.join(PurchaseOrder, (PurchaseOrder.id == SupplierBill.purchase_order_id) & (PurchaseOrder.tenant_id == tenant_id)).where(PurchaseOrder.branch_id == branch_id)
        if order_id:
            stmt = stmt.where(SupplierBill.purchase_order_id == order_id)
        if status:
            stmt = stmt.where(SupplierBill.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def duplicate_invoice(self, tenant_id, supplier_id, reference, except_id):
        return await self.db.scalar(select(SupplierBill.id).where(
            SupplierBill.tenant_id == tenant_id, SupplierBill.supplier_id == supplier_id,
            func.lower(func.trim(SupplierBill.supplier_invoice_reference)) == reference.strip().lower(),
            SupplierBill.id != except_id).limit(1))

    async def base_billed(self, tenant_id: uuid.UUID, order_id: uuid.UUID):
        return await self.db.scalar(select(func.coalesce(func.sum(SupplierBill.base_amount), 0))
            .where(SupplierBill.tenant_id == tenant_id, SupplierBill.purchase_order_id == order_id))

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        from app.modules.accounting.repository.reporting import ReportingRepository

        await ReportingRepository(self.db).lock_tenant(tenant_id)
        # MAX of the existing numeric suffix, not COUNT(*) — COUNT collides
        # with a still-existing higher number as soon as any bill has ever
        # been deleted for this tenant.
        result = await self.db.execute(
            select(func.max(cast(func.substring(SupplierBill.reference, 6), Integer)))
            .where(SupplierBill.tenant_id == tenant_id,
                   SupplierBill.reference.op("~")(r"^BILL-[0-9]{1,9}$"))
        )
        current_max = result.scalar_one() or 0
        return f"BILL-{str(current_max + 1).zfill(4)}"


class SupplierPaymentRepository(BaseRepository[SupplierPayment]):
    model = SupplierPayment

    async def list_for_bill(self, tenant_id: uuid.UUID, bill_id: uuid.UUID, offset: int = 0, limit: int = 25) -> list[SupplierPayment]:
        result = await self.db.execute(
            select(SupplierPayment)
            .where(SupplierPayment.tenant_id == tenant_id, SupplierPayment.bill_id == bill_id)
            .order_by(SupplierPayment.paid_at.desc(), SupplierPayment.id).offset(offset).limit(limit)
        )
        return list(result.scalars().all())

    async def count_for_bill(self, tenant_id: uuid.UUID, bill_id: uuid.UUID) -> int:
        return await self.db.scalar(select(func.count()).select_from(SupplierPayment)
            .where(SupplierPayment.tenant_id == tenant_id, SupplierPayment.bill_id == bill_id)) or 0

    async def base_applied(self, tenant_id: uuid.UUID, bill_id: uuid.UUID):
        return await self.db.scalar(select(func.coalesce(func.sum(func.coalesce(SupplierPayment.base_applied_amount, SupplierPayment.amount)), 0))
            .where(SupplierPayment.tenant_id == tenant_id, SupplierPayment.bill_id == bill_id))

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        return f"PAY-{uuid.uuid4().hex[:20].upper()}"
