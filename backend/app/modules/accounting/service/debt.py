"""Debt workspace orchestration. All settlements reuse the original financial services."""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.modules.accounting.repository.debt import DebtRepository
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.schemas.debt import DebtFilters, DebtKind, DebtPaymentRequest
from app.modules.accounting.service.workspace import allow, encoded, resolve_branch
from app.modules.currency.service import get_base_currency
from app.modules.tenants.models.user import User


def resource(kind: DebtKind) -> str:
    return "accounts_payable" if kind == "payable" else "accounts_receivable"


async def context(
    db: AsyncSession, user: User, kind: DebtKind, active: uuid.UUID | None
) -> tuple[uuid.UUID, uuid.UUID | None, str]:
    tenant = allow(user, resource(kind))
    branch = await resolve_branch(db, user, None, active)
    currency = await get_base_currency(db, tenant)
    return tenant, branch, currency


async def records(
    db: AsyncSession,
    user: User,
    kind: DebtKind,
    active: uuid.UUID | None,
    filters: DebtFilters,
    page: int,
    size: int,
) -> dict:
    tenant, branch, currency = await context(db, user, kind, active)
    repo = DebtRepository(db)
    rows = repo.filtered(
        repo.projection(tenant, kind, currency, branch, datetime.now(UTC).date()), filters
    )
    summary = await repo.summary(rows)
    items = await repo.page(rows, (page - 1) * size, size)
    return encoded(
        {
            "items": items,
            "total": summary["total"],
            "page": page,
            "page_size": size,
            "summary": summary,
            "currency": currency,
        }
    )


async def overview(db: AsyncSession, user: User, active: uuid.UUID | None) -> dict:
    if user.tenant_id is None:
        raise ValidationError("This account has no tenant")
    branch = await resolve_branch(db, user, None, active)
    currency = await get_base_currency(db, user.tenant_id)
    repo = DebtRepository(db)
    totals, projections = {}, []
    for kind in ("receivable", "payable"):
        if not user.is_superuser and f"{resource(kind)}:read" not in user.permissions_names:
            totals[kind] = None
            continue
        projection = repo.projection(
            user.tenant_id, kind, currency, branch, datetime.now(UTC).date()
        )
        totals[kind] = await repo.summary(projection.subquery())
        projections.append(projection)
    if not projections:
        raise ForbiddenError("Debt viewing permission is required")
    return encoded(
        {"totals": totals, "items": await repo.upcoming(projections), "currency": currency}
    )


async def detail(
    db: AsyncSession,
    user: User,
    kind: DebtKind,
    document_id: uuid.UUID,
    active: uuid.UUID | None,
    payment_page: int,
) -> dict:
    tenant, branch, currency = await context(db, user, kind, active)
    repo = DebtRepository(db)
    row = await repo.one(
        repo.projection(tenant, kind, currency, branch, datetime.now(UTC).date()), document_id
    )
    if row is None:
        raise NotFoundError("Debt record not found in this branch")
    payments, total = await repo.history(tenant, kind, document_id, (payment_page - 1) * 25, 25)
    for payment in payments:
        payment["currency"] = payment.pop("currency_code") or row["currency"]
    return encoded(
        {
            "record": row,
            "payments": payments,
            "payment_total": total,
            "payment_page": payment_page,
            "payment_page_size": 25,
        }
    )


async def pay(
    db: AsyncSession,
    user: User,
    kind: DebtKind,
    document_id: uuid.UUID,
    active: uuid.UUID | None,
    data: DebtPaymentRequest,
) -> dict:
    tenant = allow(user, resource(kind), "create")
    await ReportingRepository(db).lock_tenant(tenant)
    current = await detail(db, user, kind, document_id, active, 1)
    row = current["record"]
    paid_at = data.paid_at.replace(tzinfo=UTC) if not data.paid_at.tzinfo else data.paid_at
    if paid_at.date() > datetime.now(UTC).date():
        raise ValidationError("Payment date cannot be in the future")
    if row["issue_date"] and paid_at.date().isoformat() < row["issue_date"]:
        raise ValidationError("Payment cannot precede the original transaction")
    prior = await DebtRepository(db).payment_key(tenant, kind, data.client_payment_id)
    if prior:
        prior_document = prior.bill_id if kind == "payable" else prior.order_id
        if (
            prior_document != document_id
            or Decimal(str(prior.amount)) != data.amount
            or prior.payment_method != data.payment_method
            or prior.paid_at != paid_at
        ):
            raise ConflictError("Payment retry key was already used with different details")
        if kind == "receivable":
            metadata = {"notes": prior.notes, "reference_number": prior.reference_number}
        else:
            metadata = await DebtRepository(db).payment_metadata(tenant, prior.id)
        if (metadata.get("notes") or "") != data.notes or (
            metadata.get("reference_number") or ""
        ) != data.reference_number:
            raise ConflictError("Payment retry key was already used with different details")
        return current
    if data.amount > Decimal(row["outstanding"]):
        raise ValidationError("Payment cannot exceed the outstanding balance")
    if kind == "receivable":
        from app.modules.sales.schemas.order_payment import OrderPaymentCreate
        from app.modules.sales.service.order_payment import record_payment

        await record_payment(
            db,
            tenant,
            user.id,
            user.full_name,
            document_id,
            OrderPaymentCreate(
                amount=data.amount,
                payment_method=data.payment_method,
                paid_at=paid_at,
                reference_number=data.reference_number or None,
                notes=data.notes or None,
                client_payment_id=data.client_payment_id,
                currency_code=row["currency"],
            ),
        )
    else:
        from app.modules.procurement.schemas.supplier_bill import SupplierPaymentCreate
        from app.modules.procurement.service.supplier_bill import record_payment

        await record_payment(
            db,
            tenant,
            user.id,
            document_id,
            SupplierPaymentCreate(
                amount=data.amount,
                payment_method=data.payment_method,
                paid_at=paid_at,
                client_reference="DEBT-" + data.client_payment_id,
                currency_code=row["currency"],
                notes=data.notes or None,
                reference_number=data.reference_number or None,
            ),
            user,
        )
    return await detail(db, user, kind, document_id, active, 1)


async def draft_purchases(db: AsyncSession, user: User, active: uuid.UUID | None,
                          page: int, size: int) -> dict:
    tenant, branch, currency = await context(db, user, "payable", active)
    allow(user, "purchase_orders")
    items, total = await DebtRepository(db).draft_purchases(tenant, branch, (page - 1) * size, size)
    return encoded({"items": items, "total": total, "page": page, "currency": currency})


async def receive_payable(db: AsyncSession, user: User, active: uuid.UUID | None,
                          purchase_id: uuid.UUID, due_date: date) -> dict:
    tenant, branch, _ = await context(db, user, "payable", active)
    allow(user, "accounts_payable", "create")
    allow(user, "purchase_orders", "update")
    await ReportingRepository(db).lock_tenant(tenant)
    repo = DebtRepository(db)
    purchase = await repo.lock_purchase(tenant, branch, purchase_id)
    if purchase is None:
        raise NotFoundError("Purchase not found in this branch")
    if not purchase.supplier_id:
        raise ValidationError("Choose a supplier on the purchase before receiving it")
    # A retry of a completed receipt opens its existing bill rather than receiving stock again.
    if purchase.status == "Draft":
        from app.modules.procurement.service.purchase import receive_purchase
        await receive_purchase(db, tenant, purchase_id, user.id, due_date)
    elif purchase.status != "Received":
        raise ValidationError("Only draft purchases can be received")
    bill_id = await repo.bill_for_purchase(tenant, purchase_id)
    if bill_id is None:
        raise NotFoundError("Supplier bill not found")
    return await detail(db, user, "payable", bill_id, active, 1)
