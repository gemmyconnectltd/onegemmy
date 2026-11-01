"""Bounded operational reads over purchasing sources (not cash expenditure)."""
import uuid
from decimal import Decimal

from sqlalchemy import func, select

from app.modules.procurement.models import SupplierBill
from app.modules.procurement.repository.purchase import PurchaseOrderRepository


class PurchasingWorkspaceRepository:
    def __init__(self, db):
        self.db = db

    async def unpaid_for_order(self, tenant_id: uuid.UUID, order_id: uuid.UUID) -> bool:
        return bool(await self.db.scalar(select(SupplierBill.id).where(
            SupplierBill.tenant_id == tenant_id, SupplierBill.purchase_order_id == order_id,
            SupplierBill.amount > SupplierBill.amount_paid).limit(1)))

    async def overview(self, tenant_id: uuid.UUID, **filters) -> dict:
        orders = PurchaseOrderRepository(self.db).history_query(tenant_id, **filters).subquery()
        counts = dict((await self.db.execute(select(orders.c.status, func.count()).group_by(orders.c.status))).all())
        # Keep document currencies separate. No conversion is assumed for operational totals.
        values = (await self.db.execute(select(orders.c.currency_code, func.sum(orders.c.total))
            .where(orders.c.status != "Cancelled").group_by(orders.c.currency_code))).all()
        bills = (await self.db.execute(select(SupplierBill.currency_code,
            func.sum(SupplierBill.amount - SupplierBill.amount_paid))
            .where(SupplierBill.tenant_id == tenant_id,
                   SupplierBill.purchase_order_id.in_(select(orders.c.id)),
                   SupplierBill.amount > SupplierBill.amount_paid)
            .group_by(SupplierBill.currency_code))).all()
        return {"counts": counts, "total": sum(counts.values()),
                "commitments": [{"currency_code": code, "amount": str(amount or Decimal(0))} for code, amount in values],
                "outstanding": [{"currency_code": code, "amount": str(amount or Decimal(0))} for code, amount in bills]}

    async def activity(self, tenant_id: uuid.UUID, order_id: uuid.UUID, offset: int, limit: int):
        from app.modules.audit.models import AuditLog
        conditions = [AuditLog.tenant_id == tenant_id, AuditLog.entity_type == "purchase", AuditLog.entity_id == str(order_id)]
        total = await self.db.scalar(select(func.count()).select_from(AuditLog).where(*conditions))
        rows = await self.db.scalars(select(AuditLog).where(*conditions)
            .order_by(AuditLog.created_at.desc(), AuditLog.id).offset(offset).limit(limit))
        return [{"id": str(row.id), "action": row.action, "summary": row.summary,
                 "actor": row.actor_name, "created_at": row.created_at} for row in rows], total or 0
