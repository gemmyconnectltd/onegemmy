import uuid
from datetime import UTC, datetime, time

from sqlalchemy import text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.currency import to_base_amount
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.models.budget import Budget
from app.modules.accounting.models.expense import Expense
from app.modules.accounting.repository import BudgetRepository, ExpenseRepository
from app.modules.accounting.schemas import (
    ExpenseBulkCreate,
    ExpenseBulkResult,
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
)
from app.modules.accounting.service.transaction import create_expense_transaction
from app.modules.audit.service import record_audit
from app.modules.currency.service import document_rate, get_base_currency, resolve_document_currency


async def _stamp_currency(
    db: AsyncSession, tenant_id: uuid.UUID, obj: Expense, requested: str | None, explicit_rate: object | None = None,
) -> None:
    """Set the expense's currency, frozen rate and base-currency amount. With no foreign currency
    asked for (every existing client) this is the base currency at rate 1 and `base_amount == amount`."""
    # The rate in force on the expense date (end of that day) unless the user typed one.
    at = datetime.combine(obj.expense_date, time(23, 59, 59), tzinfo=UTC)
    code, rate, base = await resolve_document_currency(db, tenant_id, requested or obj.currency_code, explicit_rate, at=at)
    obj.currency_code, obj.exchange_rate = code, rate
    obj.base_amount = to_base_amount(obj.amount, code, base, rate)


async def list_expenses(
    db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, offset: int = 0, limit: int = 50, search: str | None = None
) -> list[ExpenseRead]:
    items = await ExpenseRepository(db).list_for_tenant(tenant_id, status, offset, limit, search)
    return [ExpenseRead.model_validate(i) for i in items]


async def count_expenses(db: AsyncSession, tenant_id: uuid.UUID, status: str | None = None, search: str | None = None) -> int:
    return await ExpenseRepository(db).count_for_tenant(tenant_id, status, search)


async def get_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> ExpenseRead:
    obj = await ExpenseRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    return ExpenseRead.model_validate(obj)


async def create_expense(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: ExpenseCreate, user_name: str | None = None) -> ExpenseRead:
    repo = ExpenseRepository(db)
    reference = await repo.next_reference(tenant_id)
    fields = data.model_dump(exclude={"currency_code", "exchange_rate"})
    obj = Expense(
        tenant_id=tenant_id,
        reference=reference,
        created_by=user_id,
        **fields,
    )
    await _stamp_currency(db, tenant_id, obj, data.currency_code, data.exchange_rate)
    obj = await repo.save(obj)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="expense.create",
        entity_type="expense",
        entity_id=str(obj.id),
        summary=f"Created expense {reference}",
        changes={
            "reference": reference, "amount": obj.amount, "category": data.category,
            "currency": obj.currency_code, "base_amount": str(obj.base_amount),
        },
    )
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return ExpenseRead.model_validate(obj)


async def bulk_create_expenses(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID, data: ExpenseBulkCreate, user_name: str | None = None
) -> ExpenseBulkResult:
    """CSV-style bulk import. Every imported expense is created Pending (same as
    the single form) with a server-assigned EXP- reference. Fail-soft per row:
    one bad record never aborts the rest."""
    repo = ExpenseRepository(db)
    created = 0
    failed = 0
    errors: list[str] = []

    for item in data.items:
        try:
            reference = await repo.next_reference(tenant_id)
            obj = Expense(
                tenant_id=tenant_id,
                reference=reference,
                created_by=user_id,
                **item.model_dump(exclude={"currency_code", "exchange_rate"}),
            )
            await _stamp_currency(db, tenant_id, obj, item.currency_code, item.exchange_rate)
            obj = await repo.save(obj)
            await record_audit(
                db,
                tenant_id=tenant_id,
                actor_user_id=user_id,
                actor_name=user_name,
                action="expense.create",
                entity_type="expense",
                entity_id=str(obj.id),
                summary=f"Created expense {reference}",
                changes={"reference": reference, "amount": obj.amount, "category": item.category},
            )
            created += 1
        except SQLAlchemyError as e:
            await db.rollback()
            failed += 1
            errors.append(f"{item.title}: {e!s}")

    if created > 0:
        await db.commit()
    return ExpenseBulkResult(created=created, failed=failed, errors=errors)


async def update_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: ExpenseUpdate) -> ExpenseRead:
    repo = ExpenseRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    if obj.status != "Pending":
        raise ValidationError("Only pending expenses can be edited")
    updates = data.model_dump(exclude_unset=True)
    new_currency = updates.pop("currency_code", None)
    new_rate = updates.pop("exchange_rate", None)
    for field, value in updates.items():
        setattr(obj, field, value)
    # Anything that changes the money (amount, date, currency, rate) re-derives the base value.
    if {"amount", "expense_date"} & updates.keys() or new_currency is not None or new_rate is not None:
        await _stamp_currency(db, tenant_id, obj, new_currency, new_rate)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return ExpenseRead.model_validate(obj)


async def approve_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None = None) -> ExpenseRead:
    # Lock the row to prevent duplicate approvals from concurrent requests
    await db.execute(text("SELECT 1 FROM accounting_expenses WHERE id = :id FOR UPDATE"), {"id": id})

    repo = ExpenseRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    if obj.status != "Pending":
        raise ValidationError(f"Expense is already {obj.status}")
    obj.status = "Approved"
    obj.approved_by = user_id
    # Approval is when the expense becomes financially effective: its currency, rate and base value
    # are final from here on (a row from before multi-currency has none: it is base currency at 1).
    base_ccy = await get_base_currency(db, tenant_id)
    if obj.base_amount is None:
        obj.currency_code = obj.currency_code or base_ccy
        obj.exchange_rate = document_rate(obj)
        obj.base_amount = to_base_amount(obj.amount, obj.currency_code, base_ccy, obj.exchange_rate)
    base_amount = obj.base_amount
    await repo.save(obj)

    # bump budget spent (budgets are in the tenant's base currency)
    period = obj.expense_date.strftime("%Y-%m")
    if obj.account_id:
        budget = await BudgetRepository(db).get_by_account_period(tenant_id, obj.account_id, period)
        if budget:
            await db.execute(
                update(Budget)
                .where(Budget.id == budget.id)
                .values(spent=Budget.spent + base_amount)
            )

    # auto-create journal entry
    await create_expense_transaction(
        db, tenant_id, user_id, obj.id, float(base_amount), obj.reference, obj.account_id,
        payment_method=obj.payment_method, payment_date=obj.expense_date, branch_id=obj.branch_id,
    )

    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="expense.approve",
        entity_type="expense",
        entity_id=str(obj.id),
        summary=f"Approved expense {obj.reference}",
        changes={"status": "Approved", "reference": obj.reference, "amount": obj.amount},
    )
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return ExpenseRead.model_validate(obj)


async def reject_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, user_id: uuid.UUID, user_name: str | None = None) -> ExpenseRead:
    repo = ExpenseRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    if obj.status != "Pending":
        raise ValidationError(f"Expense is already {obj.status}")
    obj.status = "Rejected"
    obj.approved_by = user_id
    await repo.save(obj)
    await record_audit(
        db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        actor_name=user_name,
        action="expense.reject",
        entity_type="expense",
        entity_id=str(obj.id),
        summary=f"Rejected expense {obj.reference}",
        changes={"status": "Rejected", "reference": obj.reference},
    )
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return ExpenseRead.model_validate(obj)


async def delete_expense(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await ExpenseRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Expense not found")
    if obj.status == "Approved":
        raise ValidationError("Cannot delete an approved expense")
    await ExpenseRepository(db).delete(obj)
    await db.commit()
