"""Customer lifecycle (active / inactive / archived), safe deletion, and the per-customer figures shown in the list.

Nothing here deletes or detaches financial history: archiving and deactivating only change what new transactions may use,
and permanent deletion is refused while anything at all refers to the customer.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.sales.models.customer import Customer

ACTIVE, INACTIVE, ARCHIVED = "active", "inactive", "archived"


def status_of(customer) -> str:
    if getattr(customer, "archived_at", None) is not None:
        return ARCHIVED
    return ACTIVE if customer.is_active else INACTIVE


async def _get(db: AsyncSession, tenant_id: uuid.UUID, customer_id: uuid.UUID, lock: bool = False) -> Customer:
    stmt = select(Customer).where(Customer.tenant_id == tenant_id, Customer.id == customer_id)
    customer = (await db.execute(stmt.with_for_update() if lock else stmt)).scalar_one_or_none()
    if customer is None:
        raise NotFoundError("Customer not found")
    return customer


async def require_usable(db: AsyncSession, tenant_id: uuid.UUID, customer_id: uuid.UUID | None) -> None:
    """New sales, quotations and other new documents may only name an active customer. History is never affected."""
    if customer_id is None:
        return
    customer = await _get(db, tenant_id, customer_id)
    status = status_of(customer)
    if status != ACTIVE:
        raise ValidationError(f"{customer.name} is {status}. Reactivate the customer before starting a new sale for them.")


async def dependencies(db: AsyncSession, tenant_id: uuid.UUID, customer_id: uuid.UUID) -> dict[str, int]:
    """Every record that refers to the customer, by kind. Any of them makes permanent deletion unsafe."""
    from app.modules.accounting.models.debt import ManualDebt
    from app.modules.crm.models.activity import Activity
    from app.modules.discounts.models import AppliedDiscount, Coupon, CouponRedemption
    from app.modules.repairs.models.job import RepairJob
    from app.modules.sales.models.deal import Deal
    from app.modules.sales.models.order import Order
    from app.modules.sales.models.order_payment import OrderPayment
    from app.modules.sales.models.quotation import Quotation
    from app.modules.sales.models.return_ import Return
    from app.modules.services.models.appointment import Appointment
    from app.modules.services.models.queue_entry import QueueEntry

    kinds = {
        "sales": Order, "payments": OrderPayment, "quotations": Quotation, "returns": Return, "debts": ManualDebt,
        "deals": Deal, "crm_activities": Activity, "repair_jobs": RepairJob, "appointments": Appointment,
        "queue_entries": QueueEntry, "coupons": Coupon, "coupon_redemptions": CouponRedemption, "discounts_applied": AppliedDiscount,
    }
    counts: dict[str, int] = {}
    for label, model in kinds.items():
        stmt = select(func.count()).select_from(model).where(model.customer_id == customer_id)
        if hasattr(model, "tenant_id"):
            stmt = stmt.where(model.tenant_id == tenant_id)
        n = int(await db.scalar(stmt) or 0)
        if n:
            counts[label] = n
    return counts


async def _audit(db, tenant_id, actor, action: str, customer: Customer, summary: str, changes: dict | None = None) -> None:
    from app.modules.audit.service import record_audit
    await record_audit(db, tenant_id=tenant_id, actor_user_id=getattr(actor, "id", None), actor_name=getattr(actor, "full_name", None),
                       action=action, entity_type="customer", entity_id=str(customer.id), summary=summary, changes=changes)


async def set_status(db: AsyncSession, tenant_id: uuid.UUID, customer_id: uuid.UUID, status: str, actor) -> Customer:
    """Move a customer between active, inactive and archived. The customer keeps its id and all of its history."""
    if status not in (ACTIVE, INACTIVE, ARCHIVED):
        raise ValidationError("Status must be active, inactive or archived")
    customer = await _get(db, tenant_id, customer_id, lock=True)
    before = status_of(customer)
    if before == status:
        return customer
    if status == ARCHIVED:
        customer.archived_at, customer.archived_by = datetime.now(UTC), getattr(actor, "id", None)
    else:
        customer.archived_at, customer.archived_by = None, None
        customer.is_active = status == ACTIVE
    verb = {ACTIVE: "reactivated", INACTIVE: "deactivated", ARCHIVED: "archived"}[status]
    await _audit(db, tenant_id, actor, f"customer.{verb}", customer, f"Customer {customer.name} {verb}", {"status": {"from": before, "to": status}})
    await db.commit()
    await db.refresh(customer)
    return customer


async def delete_permanently(db: AsyncSession, tenant_id: uuid.UUID, customer_id: uuid.UUID, actor) -> None:
    """Delete a customer only when nothing refers to it. Otherwise refuse and point to archiving, which keeps history."""
    customer = await _get(db, tenant_id, customer_id, lock=True)
    linked = await dependencies(db, tenant_id, customer_id)
    if linked:
        what = ", ".join(f"{n} {k.replace('_', ' ')}" for k, n in linked.items())
        raise ConflictError(f"{customer.name} can't be deleted because records refer to them ({what}). Archive the customer instead: their history stays intact.")
    await _audit(db, tenant_id, actor, "customer.deleted", customer, f"Customer {customer.name} deleted permanently",
                 {"name": customer.name, "customer_type": customer.customer_type})
    await db.delete(customer)
    await db.commit()


async def list_figures(db: AsyncSession, tenant_id: uuid.UUID, ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """Orders, completed sales, last order and unpaid balance for a page of customers, in one grouped query (base currency)."""
    from app.modules.sales.models.order import Order

    if not ids:
        return {}
    rate = func.coalesce(Order.exchange_rate, 1)
    completed = Order.status == "Completed"
    rows = (await db.execute(
        select(Order.customer_id, func.count().filter(Order.status != "Cancelled"),
               func.sum(case((completed, func.coalesce(Order.base_total, Order.total)), else_=0)),
               func.max(Order.ordered_at).filter(Order.status != "Cancelled"),
               func.sum(case((completed, (Order.total - Order.amount_paid) * rate), else_=0)))
        .where(Order.tenant_id == tenant_id, Order.customer_id.in_(ids)).group_by(Order.customer_id))).all()
    out: dict[uuid.UUID, dict] = {}
    for customer_id, orders, spent, last, unpaid in rows:
        out[customer_id] = {"orders_count": int(orders or 0), "total_spent": Decimal(str(spent or 0)).quantize(Decimal("0.01")),
                            "last_order_at": last, "outstanding": max(Decimal(str(unpaid or 0)).quantize(Decimal("0.01")), Decimal(0))}
    return out
