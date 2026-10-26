"""Debt changes that have no source-document flow of their own: edit, write-off, void, opening balances and their
payments. Every action checks its own permission here (the router guard is only the coarse outer gate) and is audited."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.accounting.models.debt import DebtAdjustment, ManualDebt, ManualDebtPayment
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.schemas.debt import (
    DebtEditRequest,
    DebtKind,
    DebtPaymentRequest,
    ManualDebtRequest,
)
from app.modules.accounting.service import debt as base
from app.modules.accounting.service.workspace import allow, resolve_branch
from app.modules.audit.service import record_audit
from app.modules.tenants.models.user import User


async def _current(db, user, kind, document_id, active):
    return (await base.detail(db, user, kind, document_id, active, 1))["record"]


async def edit(db: AsyncSession, user: User, kind: DebtKind, document_id: uuid.UUID, active, data: DebtEditRequest) -> dict:
    tenant = allow(user, base.resource(kind), "update")
    await ReportingRepository(db).lock_tenant(tenant)
    row = await _current(db, user, kind, document_id, active)
    if Decimal(row["outstanding"]) <= 0:
        raise ValidationError("A settled or written-off debt cannot be edited")
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        raise ValidationError("Nothing to change")
    if changes.get("due_date") and row["issue_date"] and changes["due_date"].isoformat() < row["issue_date"]:
        raise ValidationError("Due date cannot be before the issue date")
    before: dict = {}
    if row["is_manual"]:
        debt = await db.get(ManualDebt, document_id)
        for field, value in changes.items():
            if field == "reference" and value != debt.reference and await db.scalar(
                    select(func.count()).select_from(ManualDebt).where(ManualDebt.tenant_id == tenant, ManualDebt.reference == value)):
                raise ConflictError("That reference is already used")
            before[field] = str(getattr(debt, field))
            setattr(debt, field, value)
    else:
        if "reference" in changes:
            raise ValidationError("The reference of a sale or purchase cannot be changed here")
        if kind == "payable":
            from app.modules.procurement.models.supplier_bill import SupplierBill
            source = await db.get(SupplierBill, document_id)
        else:
            from app.modules.sales.models.order import Order
            source = await db.get(Order, document_id)
        for field, value in changes.items():
            if field == "notes" and kind == "payable":
                raise ValidationError("Notes can only be edited on a receivable or an opening balance")
            before[field] = str(getattr(source, field, None))
            setattr(source, field, value)
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action=f"debt.{kind}.edit",
                       entity_type=f"debt_{kind}", entity_id=str(document_id), summary=f"Edited {row['reference']}",
                       changes={"before": before, "after": {k: str(v) for k, v in changes.items()}})
    await db.commit()
    return await base.detail(db, user, kind, document_id, active, 1)


async def write_off(db: AsyncSession, user: User, kind: DebtKind, document_id: uuid.UUID, active, reason: str) -> dict:
    tenant = allow(user, base.resource(kind), "update")
    await ReportingRepository(db).lock_tenant(tenant)
    row = await _current(db, user, kind, document_id, active)
    outstanding = Decimal(row["outstanding"])
    if outstanding <= 0:
        raise ValidationError("Nothing is outstanding on this debt")
    db.add(DebtAdjustment(tenant_id=tenant, kind=kind, document_id=document_id, action="write_off", amount=outstanding,
                          reason=reason, created_by=user.id, actor_name=user.full_name))
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action=f"debt.{kind}.write_off",
                       entity_type=f"debt_{kind}", entity_id=str(document_id), summary=f"Wrote off {row['reference']}",
                       changes={"amount": str(outstanding), "reason": reason})
    await db.commit()
    return await base.detail(db, user, kind, document_id, active, 1)


async def void(db: AsyncSession, user: User, kind: DebtKind, document_id: uuid.UUID, active, reason: str) -> dict:
    tenant = allow(user, base.resource(kind), "delete")
    await ReportingRepository(db).lock_tenant(tenant)
    row = await _current(db, user, kind, document_id, active)
    if not row["is_manual"]:
        raise ValidationError("A sale or purchase cannot be voided from Debt Management; write it off, or cancel the source document")
    if Decimal(row["paid"]) > 0:
        raise ValidationError("A debt with payments cannot be voided; write off the remainder instead")
    db.add(DebtAdjustment(tenant_id=tenant, kind=kind, document_id=document_id, action="void", amount=Decimal(row["original"]),
                          reason=reason, created_by=user.id, actor_name=user.full_name))
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action=f"debt.{kind}.void",
                       entity_type=f"debt_{kind}", entity_id=str(document_id), summary=f"Voided {row['reference']}",
                       changes={"amount": row["original"], "reason": reason})
    await db.commit()
    return {"id": str(document_id), "voided": True}


async def create_manual(db: AsyncSession, user: User, kind: DebtKind, active, data: ManualDebtRequest) -> dict:
    tenant = allow(user, base.resource(kind), "create")
    branch = await resolve_branch(db, user, data.branch_id, active)
    if branch is None:
        raise ValidationError("Choose the branch this debt belongs to")
    await ReportingRepository(db).lock_tenant(tenant)
    if data.issue_date > datetime.now(UTC).date():
        raise ValidationError("Issue date cannot be in the future")
    if kind == "receivable":
        from app.modules.sales.models.customer import Customer as Party
    else:
        from app.modules.inventory.models.supplier import Supplier as Party
    party = (await db.execute(select(Party).where(Party.tenant_id == tenant, Party.id == data.party_id))).scalar_one_or_none()
    if party is None:
        raise NotFoundError("Customer not found" if kind == "receivable" else "Supplier not found")
    reference = data.reference.strip() or f"{'OB' if kind == 'receivable' else 'OP'}-{data.issue_date:%y%m%d}-{uuid.uuid4().hex[:6].upper()}"
    if await db.scalar(select(func.count()).select_from(ManualDebt).where(ManualDebt.tenant_id == tenant, ManualDebt.reference == reference)):
        raise ConflictError("That reference is already used")
    debt = ManualDebt(tenant_id=tenant, kind=kind, reference=reference, branch_id=branch, amount=data.amount, issue_date=data.issue_date,
                      due_date=data.due_date, notes=data.notes or None, created_by=user.id,
                      customer_id=data.party_id if kind == "receivable" else None,
                      supplier_id=data.party_id if kind == "payable" else None)
    from app.modules.currency.service import get_base_currency
    debt.currency_code = await get_base_currency(db, tenant)
    db.add(debt)
    await db.flush()
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action=f"debt.{kind}.create_manual",
                       entity_type=f"debt_{kind}", entity_id=str(debt.id), summary=f"Recorded opening balance {reference}",
                       changes={"party": party.name, "amount": str(data.amount), "branch_id": str(branch)})
    await db.commit()
    return {"id": str(debt.id), "reference": reference}


async def pay_manual(db: AsyncSession, user: User, kind: DebtKind, document_id: uuid.UUID, paid_at: datetime,
                     data: DebtPaymentRequest, tenant: uuid.UUID) -> None:
    debt = (await db.execute(select(ManualDebt).where(ManualDebt.id == document_id, ManualDebt.tenant_id == tenant).with_for_update())).scalar_one()
    db.add(ManualDebtPayment(tenant_id=tenant, debt_id=document_id, reference="MDP-" + data.client_payment_id, amount=data.amount,
                             payment_method=data.payment_method, reference_number=data.reference_number or None,
                             notes=data.notes or None, paid_at=paid_at, created_by=user.id))
    debt.amount_paid = Decimal(debt.amount_paid) + data.amount
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action=f"debt.{kind}.payment",
                       entity_type=f"debt_{kind}", entity_id=str(document_id), summary=f"Recorded payment on {debt.reference}",
                       changes={"amount": str(data.amount), "method": data.payment_method})
    await db.commit()

