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


async def write_off(db: AsyncSession, user: User, kind: DebtKind, document_id: uuid.UUID, active, reason: str,
                    amount: Decimal | None = None) -> dict:
    """Write off all or part of what is still owed. The balance, the ledger (bad debt / other income) and the audit trail
    move together in one transaction; the tenant lock serialises concurrent attempts so the same money is never written off twice."""
    from app.modules.accounting.service.transaction import create_write_off_transaction
    tenant = allow(user, base.resource(kind), "approve")
    await ReportingRepository(db).lock_tenant(tenant)
    row = await _current(db, user, kind, document_id, active)
    outstanding = Decimal(row["outstanding"])
    if outstanding <= 0:
        raise ValidationError("Nothing is outstanding on this debt")
    amount = outstanding if amount is None else Decimal(amount)
    if amount <= 0 or amount > outstanding:
        raise ValidationError(f"The write-off must be between 0 and the {outstanding} still outstanding")
    adjustment = DebtAdjustment(tenant_id=tenant, kind=kind, document_id=document_id, action="write_off", amount=amount,
                                reason=reason, created_by=user.id, actor_name=user.full_name)
    db.add(adjustment)
    await db.flush()
    rate = Decimal(str(row.get("rate") or 1))
    journal = await create_write_off_transaction(
        db, tenant, user.id, kind, (amount * rate).quantize(Decimal("0.01")), row["reference"], adjustment.id,
        branch_id=active, posting_date=datetime.now(UTC).date())
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action=f"debt.{kind}.write_off",
                       entity_type=f"debt_{kind}", entity_id=str(document_id), summary=f"Wrote off {row['reference']}",
                       changes={"amount": str(amount), "outstanding_before": str(outstanding), "reason": reason, "journal": journal.reference})
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


async def client_outstanding(db: AsyncSession, tenant: uuid.UUID, customer_id: uuid.UUID) -> Decimal:
    """Everything one client owes the business right now, in base currency, across all branches: unpaid sales and opening balances."""
    from app.modules.accounting.repository.debt import DebtRepository
    from app.modules.currency.service import get_base_currency
    currency = await get_base_currency(db, tenant)
    rows = DebtRepository(db).projection(tenant, "receivable", currency, None, datetime.now(UTC).date()).subquery()
    return Decimal((await db.execute(select(func.coalesce(func.sum(rows.c.base_outstanding), 0)).where(rows.c.party_id == customer_id))).scalar_one())


async def insert_manual(db: AsyncSession, tenant: uuid.UUID, user_id: uuid.UUID | None, kind: DebtKind, branch: uuid.UUID, data) -> ManualDebt:
    """Write an opening-balance debt. `data` is a ManualDebtRequest or the same fields held in an approval request."""
    get = (lambda k, d=None: getattr(data, k, d)) if not isinstance(data, dict) else (lambda k, d=None: data.get(k, d))
    from datetime import date as date_type

    def day(value):
        return value if isinstance(value, date_type) or value is None else date_type.fromisoformat(str(value))
    issue = day(get("issue_date"))
    reference = (get("reference") or "").strip() or f"{'OB' if kind == 'receivable' else 'OP'}-{issue:%y%m%d}-{uuid.uuid4().hex[:6].upper()}"
    if await db.scalar(select(func.count()).select_from(ManualDebt).where(ManualDebt.tenant_id == tenant, ManualDebt.reference == reference)):
        raise ConflictError("That reference is already used")
    party = uuid.UUID(str(get("party_id")))
    debt = ManualDebt(tenant_id=tenant, kind=kind, reference=reference, branch_id=branch, amount=Decimal(str(get("amount"))), issue_date=issue,
                      due_date=day(get("due_date")), notes=get("notes") or None, created_by=user_id,
                      customer_id=party if kind == "receivable" else None, supplier_id=party if kind == "payable" else None)
    from app.modules.currency.service import get_base_currency
    debt.currency_code = await get_base_currency(db, tenant)
    db.add(debt)
    await db.flush()
    return debt


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
    if kind == "receivable":
        held = await hold_if_over_limit(db, user, tenant, party, branch, data)
        if held is not None:
            return held
    debt = await insert_manual(db, tenant, user.id, kind, branch, data)
    await record_audit(db, tenant_id=tenant, actor_user_id=user.id, actor_name=user.full_name, action=f"debt.{kind}.create_manual",
                       entity_type=f"debt_{kind}", entity_id=str(debt.id), summary=f"Recorded opening balance {debt.reference}",
                       changes={"party": party.name, "amount": str(data.amount), "branch_id": str(branch)})
    await db.commit()
    return {"id": str(debt.id), "reference": debt.reference}


async def hold_if_over_limit(db: AsyncSession, user: User, tenant: uuid.UUID, customer, branch: uuid.UUID, data) -> dict | None:
    """A client's total debt may not pass the business's limit on a person's say-so: it waits as a request, counted nowhere until approved.
    People with approval authority record it directly, and the business can switch the rule off."""
    from app.modules.approvals import service as approvals
    from app.modules.tenants.models import Tenant
    if approvals.can_decide(user) or not await approvals.rule_on(db, tenant, "debt_over_limit"):
        return None
    limit = (await db.execute(select(Tenant.debt_limit_per_client).where(Tenant.id == tenant))).scalar_one_or_none()
    if limit is None:
        return None
    owed = await client_outstanding(db, tenant, customer.id)
    if owed + Decimal(str(data.amount)) <= limit:
        return None
    payload = {"party_id": str(customer.id), "amount": str(data.amount), "issue_date": data.issue_date.isoformat(), "due_date": data.due_date.isoformat() if data.due_date else None,
               "reference": data.reference, "notes": data.notes, "branch_id": str(branch), "currently_owed": str(owed), "limit": str(limit)}
    request = await approvals.create_request(db, user, kind="debt_over_limit", subject_id=customer.id, branch_id=branch,
                                             reason=f"{customer.name} would owe {owed + Decimal(str(data.amount)):,.0f}, over the limit of {limit:,.0f}", payload=payload)
    return {"pending_approval": True, "approval_request_id": str(request.id), "message": "This takes the client over the debt limit, so it was sent for approval and is not counted yet."}


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

