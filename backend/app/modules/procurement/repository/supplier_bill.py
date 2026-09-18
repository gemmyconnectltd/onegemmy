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

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50) -> list[SupplierBill]:
        stmt = select(SupplierBill).options(*_with_relations()).where(SupplierBill.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(SupplierBill.status == status)
        stmt = stmt.order_by(SupplierBill.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(SupplierBill).where(SupplierBill.tenant_id == tenant_id)
        if status:
            stmt = stmt.where(SupplierBill.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        # MAX of the existing numeric suffix, not COUNT(*) — COUNT collides
        # with a still-existing higher number as soon as any bill has ever
        # been deleted for this tenant.
        result = await self.db.execute(
            select(func.max(cast(func.substring(SupplierBill.reference, 6), Integer)))
            .where(SupplierBill.tenant_id == tenant_id)
        )
        current_max = result.scalar_one() or 0
        return f"BILL-{str(current_max + 1).zfill(4)}"


class SupplierPaymentRepository(BaseRepository[SupplierPayment]):
    model = SupplierPayment

    async def list_for_bill(self, tenant_id: uuid.UUID, bill_id: uuid.UUID) -> list[SupplierPayment]:
        result = await self.db.execute(
            select(SupplierPayment)
            .where(SupplierPayment.tenant_id == tenant_id, SupplierPayment.bill_id == bill_id)
            .order_by(SupplierPayment.paid_at.desc())
        )
        return list(result.scalars().all())

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.max(cast(func.substring(SupplierPayment.reference, 5), Integer)))
            .where(SupplierPayment.tenant_id == tenant_id)
        )
        current_max = result.scalar_one() or 0
        return f"PAY-{str(current_max + 1).zfill(4)}"
