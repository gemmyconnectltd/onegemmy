"""Quotations: an offer that becomes a sale only when the customer accepts it and someone converts it.

A quotation never takes payment, posts to the books or touches stock. Converting it creates an ordinary *Pending* order carrying the
quotation's reference; whatever approval policy the business runs applies to that order exactly as to any other sale.
"""
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.audit.models.audit import AuditLog
from app.modules.audit.service import record_audit
from app.modules.sales.models.order import Order
from app.modules.sales.models.quotation import Quotation, QuotationItem
from app.modules.sales.repository import CustomerRepository
from app.modules.sales.schemas.order import OrderCreate
from app.modules.sales.schemas.quotation import QuotationCreate, QuotationRead, QuotationUpdate
from app.modules.sales.service.order import _apply_vat, create_order, resolve_salesperson


def _today() -> date:
    return datetime.now(UTC).date()


def _read(q: Quotation, order_number: str | None = None) -> QuotationRead:
    read = QuotationRead.model_validate(q)
    read.salesperson_name = q.salesperson.full_name if q.salesperson else None
    read.converted_order_number = order_number
    return read


async def _load(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, *, lock: bool = False) -> Quotation:
    stmt = select(Quotation).where(Quotation.id == id, Quotation.tenant_id == tenant_id).execution_options(populate_existing=True)
    if lock:
        stmt = stmt.with_for_update(of=Quotation)
    q = (await db.execute(stmt)).unique().scalar_one_or_none()
    if q is None:
        raise NotFoundError("Quotation not found")
    if q.status == "Sent" and q.expiry_date and q.expiry_date < _today():
        q.status = "Expired"
        await db.flush()
    return q


async def _number(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    current = (await db.execute(select(func.max(cast(func.substring(Quotation.quote_number, 5), Integer))).where(Quotation.tenant_id == tenant_id))).scalar_one() or 0
    return f"QUO-{str(current + 1).zfill(4)}"


async def _order_number(db: AsyncSession, q: Quotation) -> str | None:
    if q.converted_order_id is None:
        return None
    return (await db.execute(select(Order.order_number).where(Order.id == q.converted_order_id))).scalar_one_or_none()


def _lines(q: Quotation, items) -> None:
    q.items = [QuotationItem(position=i, product_id=it.product_id, variant_id=it.variant_id, product_name=it.product_name, sku=it.sku,
                             variant_attributes=it.variant_attributes, unit_price=it.unit_price, quantity=it.quantity, discount=it.discount,
                             line_total=it.line_total) for i, it in enumerate(items)]


async def _totals(db: AsyncSession, tenant_id: uuid.UUID, q: Quotation) -> None:
    q.subtotal = round(sum(float(i.line_total) for i in q.items), 2)
    gross = round(q.subtotal - float(q.discount), 2)
    if gross < 0:
        raise ValidationError("The discount cannot exceed the subtotal")
    q.tax, q.total, _ = await _apply_vat(db, tenant_id, gross)


async def _default_terms(db: AsyncSession, tenant_id: uuid.UUID) -> str | None:
    from app.modules.tenants.models import Tenant
    return (await db.execute(select(Tenant.quotation_terms).where(Tenant.id == tenant_id))).scalar_one_or_none()


async def _check_dates(issue: date, expiry: date | None) -> None:
    if expiry and expiry < issue:
        raise ValidationError("The expiry date cannot be before the issue date")


async def _check_customer(db: AsyncSession, tenant_id: uuid.UUID, customer_id: uuid.UUID | None) -> None:
    if customer_id and await CustomerRepository(db).get_by_id_for_tenant(tenant_id, customer_id) is None:
        raise ValidationError("Choose a customer belonging to this business")


async def create_quotation(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, user_name: str | None, data: QuotationCreate,
                           active_branch_id: uuid.UUID | None = None) -> QuotationRead:
    await _check_customer(db, tenant_id, data.customer_id)
    issue = data.issue_date or _today()
    await _check_dates(issue, data.expiry_date)
    q = Quotation(tenant_id=tenant_id, quote_number=await _number(db, tenant_id), status="Draft", customer_id=data.customer_id,
                  salesperson_id=await resolve_salesperson(db, tenant_id, data.salesperson_id, user_id), branch_id=active_branch_id or data.branch_id,
                  created_by=user_id, issue_date=issue, expiry_date=data.expiry_date, discount=data.discount, notes=data.notes, terms=data.terms if data.terms is not None else await _default_terms(db, tenant_id))
    _lines(q, data.items)
    await _totals(db, tenant_id, q)
    db.add(q)
    await db.flush()
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="quotation.create", entity_type="quotation",
                       entity_id=str(q.id), summary=f"Quotation {q.quote_number} created", changes={"total": float(q.total)})
    await db.commit()
    return _read(await _load(db, tenant_id, q.id))


async def update_quotation(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None, data: QuotationUpdate) -> QuotationRead:
    q = await _load(db, tenant_id, id, lock=True)
    if q.status != "Draft":
        raise ConflictError("Only a draft quotation can be edited. Create a new quotation to change an offer that was already sent.")
    fields = data.model_dump(exclude_unset=True)
    if "customer_id" in fields:
        await _check_customer(db, tenant_id, data.customer_id)
        q.customer_id = data.customer_id
    if data.salesperson_id:
        q.salesperson_id = await resolve_salesperson(db, tenant_id, data.salesperson_id, user_id)
    for field in ("issue_date", "expiry_date", "notes", "terms"):
        if field in fields:
            setattr(q, field, fields[field])
    if data.discount is not None:
        q.discount = data.discount
    await _check_dates(q.issue_date, q.expiry_date)
    if data.items is not None:
        _lines(q, data.items)
    await _totals(db, tenant_id, q)
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="quotation.update", entity_type="quotation",
                       entity_id=str(q.id), summary=f"Quotation {q.quote_number} edited", changes={"total": float(q.total)})
    await db.commit()
    return _read(await _load(db, tenant_id, id))


async def get_quotation(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> QuotationRead:
    q = await _load(db, tenant_id, id)
    out = _read(q, await _order_number(db, q))
    await db.commit()
    return out


async def list_quotations(db: AsyncSession, tenant_id: uuid.UUID, *, status: str | None, search: str | None, salesperson_id: uuid.UUID | None,
                          customer_id: uuid.UUID | None, offset: int, limit: int) -> tuple[list[QuotationRead], int]:
    # Offers past their expiry date are shown as Expired, so bring them up to date first.
    await db.execute(Quotation.__table__.update().where(Quotation.tenant_id == tenant_id, Quotation.status == "Sent", Quotation.expiry_date < _today()).values(status="Expired"))
    stmt = select(Quotation).where(Quotation.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(Quotation.status == status)
    if salesperson_id:
        stmt = stmt.where(Quotation.salesperson_id == salesperson_id)
    if customer_id:
        stmt = stmt.where(Quotation.customer_id == customer_id)
    if search:
        stmt = stmt.where(Quotation.quote_number.ilike(f"%{search}%"))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(Quotation.created_at.desc()).offset(offset).limit(limit).execution_options(populate_existing=True))).unique().scalars().all()
    await db.commit()
    return [_read(q) for q in rows], total


async def _move(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None, *, allowed: tuple[str, ...],
                to: str, action: str, reason: str | None = None) -> QuotationRead:
    q = await _load(db, tenant_id, id, lock=True)
    if q.status not in allowed:
        raise ConflictError(f"A quotation that is {q.status.lower()} cannot be {action}")
    if to == "Sent" and not q.items:
        raise ValidationError("Add at least one product before sending the quotation")
    q.status = to
    now = datetime.now(UTC)
    if to == "Sent":
        q.sent_at = now
    else:
        q.decided_at, q.decision_reason = now, reason
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action=f"quotation.{to.lower()}", entity_type="quotation",
                       entity_id=str(q.id), summary=f"Quotation {q.quote_number} {to.lower()}", changes={"reason": reason})
    await db.commit()
    return _read(await _load(db, tenant_id, id))


async def send_quotation(db, tenant_id, id, user_id, user_name):
    return await _move(db, tenant_id, id, user_id, user_name, allowed=("Draft",), to="Sent", action="sent")


async def accept_quotation(db, tenant_id, id, user_id, user_name):
    return await _move(db, tenant_id, id, user_id, user_name, allowed=("Sent",), to="Accepted", action="accepted")


async def reject_quotation(db, tenant_id, id, user_id, user_name, reason: str):
    return await _move(db, tenant_id, id, user_id, user_name, allowed=("Sent",), to="Rejected", action="rejected", reason=reason)


async def convert_quotation(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None,
                            active_branch_id: uuid.UUID | None = None) -> tuple[QuotationRead, bool]:
    """Turns an accepted quotation into a Pending order. Calling it again returns the same order: the order is keyed by the quotation."""
    q = await _load(db, tenant_id, id, lock=True)
    if q.converted_order_id is not None:
        return _read(q, await _order_number(db, q)), False
    if q.status != "Accepted":
        raise ConflictError("Only an accepted quotation can be converted into a sale")
    order = await create_order(
        db, tenant_id, user_id,
        OrderCreate(customer_id=q.customer_id, salesperson_id=q.salesperson_id, branch_id=q.branch_id, status="Pending", discount=float(q.discount),
                    notes=f"From quotation {q.quote_number}" + (f"\n{q.notes}" if q.notes else ""), client_order_id=f"quote:{q.id}",
                    items=[{"product_id": i.product_id, "variant_id": i.variant_id, "product_name": i.product_name, "sku": i.sku,
                            "variant_attributes": i.variant_attributes, "unit_price": float(i.unit_price), "quantity": float(i.quantity),
                            "discount": float(i.discount)} for i in q.items]),
        active_branch_id, preserve_quotation_prices=True,
    )
    q = await _load(db, tenant_id, id, lock=True)
    q.converted_order_id = order.id
    await record_audit(db, tenant_id=tenant_id, actor_user_id=user_id, actor_name=user_name, action="quotation.convert", entity_type="quotation",
                       entity_id=str(q.id), summary=f"Quotation {q.quote_number} converted to {order.order_number}", changes={"order_id": str(order.id)})
    await db.commit()
    q = await _load(db, tenant_id, id)
    return _read(q, order.order_number), True


async def quotation_activity(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> list[dict]:
    await _load(db, tenant_id, id)
    rows = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == str(tenant_id), AuditLog.entity_type == "quotation", AuditLog.entity_id == str(id))
                             .order_by(AuditLog.created_at.desc()))).scalars().all()
    return [{"action": r.action, "summary": r.summary, "by": r.actor_name, "at": r.created_at, "details": r.changes} for r in rows]
