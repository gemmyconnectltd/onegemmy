import uuid
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.inventory.models.supplier import Supplier
from app.modules.procurement.models.purchase_item import PurchaseItem
from app.modules.procurement.models.purchase_order import PurchaseOrder


def _with_relations():
    return [
        selectinload(PurchaseOrder.supplier),
        selectinload(PurchaseOrder.items).selectinload(PurchaseItem.product),
    ]


class PurchaseOrderRepository(BaseRepository[PurchaseOrder]):
    model = PurchaseOrder

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> PurchaseOrder | None:
        result = await self.db.execute(
            select(PurchaseOrder).options(*_with_relations()).execution_options(populate_existing=True)
            .where(PurchaseOrder.id == id, PurchaseOrder.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def by_client(self, tenant_id: uuid.UUID, reference: str) -> PurchaseOrder | None:
        return await self.db.scalar(select(PurchaseOrder).options(*_with_relations())
            .where(PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.client_reference == reference))

    def history_query(self, tenant_id, status=None, search=None, from_date=None, to_date=None, branch_id=None, supplier_id=None, currency_code=None, sort="created", direction="desc"):
        query = select(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant_id)
        if supplier_id:
            query = query.where(PurchaseOrder.supplier_id == supplier_id)
        if currency_code:
            query = query.where(PurchaseOrder.currency_code == currency_code)
        if status:
            query = query.where(PurchaseOrder.status == status)
        if branch_id:
            query = query.where(PurchaseOrder.branch_id == branch_id)
        if from_date:
            query = query.where(or_(PurchaseOrder.order_date >= from_date, PurchaseOrder.order_date.is_(None) & (PurchaseOrder.created_at >= datetime.combine(from_date, time.min, tzinfo=UTC))))
        if to_date:
            query = query.where(or_(PurchaseOrder.order_date <= to_date, PurchaseOrder.order_date.is_(None) & (PurchaseOrder.created_at < datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=UTC))))
        if search:
            pattern = "%" + search.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_") + "%"
            query = query.outerjoin(Supplier, (Supplier.id == PurchaseOrder.supplier_id) & (Supplier.tenant_id == tenant_id)).where(or_(PurchaseOrder.reference.ilike(pattern), Supplier.name.ilike(pattern)))
        return query

    async def list_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50, **filters) -> list[PurchaseOrder]:
        query = self.history_query(tenant_id, status, **filters).options(*_with_relations()).order_by(({"reference": PurchaseOrder.reference, "total": PurchaseOrder.total, "expected": PurchaseOrder.expected_date}.get(filters.get("sort"), PurchaseOrder.created_at)).asc() if filters.get("direction") == "asc" else ({"reference": PurchaseOrder.reference, "total": PurchaseOrder.total, "expected": PurchaseOrder.expected_date}.get(filters.get("sort"), PurchaseOrder.created_at)).desc(), PurchaseOrder.id.desc()).offset(offset).limit(limit)
        return list((await self.db.execute(query)).scalars())

    async def count_for_tenant(self, tenant_id: uuid.UUID, status: str | None = None, **filters) -> int:
        return (await self.db.execute(select(func.count()).select_from(self.history_query(tenant_id, status, **filters).subquery()))).scalar_one()

    async def history_summary(self, tenant_id, **filters):
        rows = self.history_query(tenant_id, **filters).subquery()
        groups = (await self.db.execute(select(rows.c.status, func.count(), func.coalesce(func.sum(func.coalesce(rows.c.base_total, rows.c.total)), 0)).group_by(rows.c.status))).all()
        counts = {status: count for status, count, amount in groups}
        return {"counts": counts, "total": sum(counts.values()), "total_value": str(sum((amount for status, count, amount in groups if status != "Cancelled"), 0))}

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        # MAX of the existing numeric suffix, not COUNT(*) — see sales/order.py's
        # next_order_number for why COUNT collides once anything is deleted.
        result = await self.db.execute(
            select(func.max(cast(func.substring(PurchaseOrder.reference, 5), Integer)))
            .where(PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.reference.op("~")(r"^PUR-[0-9]{1,9}$"))
        )
        current_max = result.scalar_one() or 0
        return f"PUR-{str(current_max + 1).zfill(4)}"

    async def financial_states(self, tenant_id: uuid.UUID, ids: list[uuid.UUID]) -> dict:
        from app.modules.procurement.models.supplier_bill import SupplierBill
        rows = await self.db.execute(select(SupplierBill.purchase_order_id, func.count(),
            func.sum(SupplierBill.amount), func.sum(SupplierBill.amount_paid))
            .where(SupplierBill.tenant_id == tenant_id, SupplierBill.purchase_order_id.in_(ids))
            .group_by(SupplierBill.purchase_order_id))
        return {row[0]: (row[1], row[2], row[3]) for row in rows}
