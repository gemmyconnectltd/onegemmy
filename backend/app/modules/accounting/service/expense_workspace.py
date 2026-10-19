"""Tenant/branch-safe expense workspace, reusing the original expense lifecycle."""

import asyncio
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.accounting.models.expense import Expense, ExpenseCategory
from app.modules.accounting.repository.expense_workspace import ExpenseWorkspaceRepository
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.accounting.schemas.expense import ExpenseCreate, ExpenseRead, ExpenseUpdate
from app.modules.accounting.schemas.expense_workspace import ExpenseCategoryInput, ExpenseFilters
from app.modules.accounting.service import expense as lifecycle
from app.modules.accounting.service.workspace import allow, encoded, resolve_branch
from app.modules.audit.service import record_audit
from app.modules.currency.service import get_base_currency
from app.modules.tenants.models.user import User


def category_read(obj: ExpenseCategory) -> dict[str, Any]:
    return {
        "id": obj.id,
        "name": obj.name,
        "description": obj.description,
        "is_active": obj.is_active,
    }


async def page(
    db: AsyncSession,
    user: User,
    active: uuid.UUID | None,
    filters: ExpenseFilters,
    number: int,
    size: int,
    overview: bool = False,
) -> dict:
    tenant = allow(user, "expenses")
    branch = await resolve_branch(db, user, None, active)
    repo = ExpenseWorkspaceRepository(db)
    query = repo.filtered(tenant, branch, filters)
    items, total = await repo.records(
        query, 0 if overview else (number - 1) * size, 5 if overview else size
    )
    data = {
        "items": [ExpenseRead.model_validate(i).model_dump() for i in items],
        "total": total,
        "page": number,
        "page_size": size,
        "currency": await get_base_currency(db, tenant),
    }
    if overview:
        data["summary"] = await repo.summary(query.where(Expense.status != "Rejected"))
    return encoded(data)


async def require_record(
    db: AsyncSession,
    user: User,
    active: uuid.UUID | None,
    identity: uuid.UUID,
    action: str = "read",
) -> Expense:
    tenant = allow(user, "expenses", action)
    branch = await resolve_branch(db, user, None, active)
    obj = await ExpenseWorkspaceRepository(db).one(tenant, branch, identity, action != "read")
    if obj is None:
        raise NotFoundError("Expense not found in this branch")
    return obj


async def detail(
    db: AsyncSession,
    user: User,
    active: uuid.UUID | None,
    identity: uuid.UUID,
    history_page: int = 1,
) -> dict:
    obj = await require_record(db, user, active, identity)
    history, total = await ExpenseWorkspaceRepository(db).history(
        user.tenant_id, identity, history_page
    )
    supplier = None
    if obj.supplier_id:
        supplier = await ExpenseWorkspaceRepository(db).supplier_name(
            user.tenant_id, obj.supplier_id
        )
    return encoded(
        {
            "record": ExpenseRead.model_validate(obj).model_dump(),
            "supplier": supplier,
            "history": history,
            "history_total": total,
        }
    )


async def validate_links(db: AsyncSession, tenant: uuid.UUID, data: dict) -> None:
    repo = ExpenseWorkspaceRepository(db)
    for field in ("supplier_id", "account_id", "order_id"):
        identity = data.get(field)
        if not identity:
            continue
        record = await repo.linked_record(tenant, field, identity)
        if record is None:
            raise ValidationError(f"Invalid {field.replace('_id', '')}")
        if field == "account_id" and (record.type != "Expenses" or not record.is_active):
            raise ValidationError("Choose an active expense account")


async def ensure_category(db: AsyncSession, tenant: uuid.UUID, name: str) -> None:
    repo = ExpenseWorkspaceRepository(db)
    category = await repo.category_by_name(tenant, name)
    if category and not category.is_active:
        raise ValidationError("This expense category is archived")
    if not category:
        db.add(ExpenseCategory(tenant_id=tenant, name=name))
        await db.flush()


async def create(
    db: AsyncSession, user: User, active: uuid.UUID | None, data: ExpenseCreate
) -> ExpenseRead:
    tenant = allow(user, "expenses", "create")
    branch = await resolve_branch(db, user, data.branch_id, active)
    await ReportingRepository(db).lock_tenant(tenant)
    if data.client_reference:
        prior = await ExpenseWorkspaceRepository(db).retry(tenant, data.client_reference)
        if prior:
            for field in (
                "title",
                "amount",
                "expense_date",
                "category",
                "notes",
                "supplier_id",
                "payment_method",
                "reference_number",
                "account_id",
            ):
                if getattr(prior, field) != getattr(data, field):
                    raise ConflictError("Expense retry key was already used with different details")
            if data.currency_code and prior.currency_code != data.currency_code:
                raise ConflictError("Expense retry key was already used with another currency")
            if data.exchange_rate is not None and prior.exchange_rate != data.exchange_rate:
                raise ConflictError("Expense retry key was already used with another exchange rate")
            if prior.branch_id != branch:
                raise ConflictError("Expense retry key was already used in another branch")
            return ExpenseRead.model_validate(prior)
    await validate_links(db, tenant, data.model_dump())
    await ensure_category(db, tenant, data.category)
    return await lifecycle.create_expense(
        db, tenant, user.id, data.model_copy(update={"branch_id": branch}), user.full_name
    )


async def edit(
    db: AsyncSession, user: User, active: uuid.UUID | None, identity: uuid.UUID, data: ExpenseUpdate
) -> ExpenseRead:
    await ReportingRepository(db).lock_tenant(allow(user, "expenses", "update"))
    obj = await require_record(db, user, active, identity, "update")
    updates = data.model_dump(exclude_unset=True)
    for field in ("title", "amount", "expense_date", "category", "payment_method"):
        if field in updates and updates[field] is None:
            raise ValidationError(f"{field} is required")
    await ReportingRepository(db).lock_tenant(user.tenant_id)
    await validate_links(db, user.tenant_id, updates)
    if data.category and data.category != obj.category:
        await ensure_category(db, user.tenant_id, data.category)
    await record_audit(
        db,
        tenant_id=user.tenant_id,
        actor_user_id=user.id,
        actor_name=user.full_name,
        action="expense.update",
        entity_type="expense",
        entity_id=str(identity),
        summary=f"Updated expense {obj.reference}",
        changes={"fields": list(updates)},
    )
    return await lifecycle.update_expense(db, user.tenant_id, identity, data)


async def act(
    db: AsyncSession, user: User, active: uuid.UUID | None, identity: uuid.UUID, action: str
):
    await ReportingRepository(db).lock_tenant(
        allow(user, "expenses", "delete" if action == "delete" else "update")
    )
    obj = await require_record(
        db, user, active, identity, "delete" if action == "delete" else "update"
    )
    if action == "delete":
        await record_audit(
            db,
            tenant_id=user.tenant_id,
            actor_user_id=user.id,
            actor_name=user.full_name,
            action="expense.delete",
            entity_type="expense",
            entity_id=str(identity),
            summary=f"Deleted expense {obj.reference}",
        )
        return await lifecycle.delete_expense(db, user.tenant_id, identity)
    handler = lifecycle.approve_expense if action == "approve" else lifecycle.reject_expense
    return await handler(db, user.tenant_id, identity, user.id, user.full_name)


async def categories(db: AsyncSession, user: User, number: int, search: str) -> dict:
    tenant = allow(user, "expenses")
    items, total = await ExpenseWorkspaceRepository(db).categories(tenant, number, search)
    return encoded(
        {
            "items": [category_read(i) for i in items],
            "total": total,
            "page": number,
            "page_size": 25,
        }
    )


async def save_category(
    db: AsyncSession, user: User, data: ExpenseCategoryInput, identity: uuid.UUID | None = None
) -> dict:
    tenant = allow(user, "expenses", "update" if identity else "create")
    await ReportingRepository(db).lock_tenant(tenant)
    repo = ExpenseWorkspaceRepository(db)
    name = data.name.strip()
    if not name:
        raise ValidationError("Category name is required")
    duplicate = await repo.category_by_name(tenant, name)
    if duplicate and duplicate.id != identity:
        raise ConflictError("An expense category with this name already exists")
    obj = await repo.category(tenant, identity) if identity else ExpenseCategory(tenant_id=tenant)
    if obj is None:
        raise NotFoundError("Expense category not found")
    if identity and obj.name != name:
        await repo.rename_category(tenant, obj.name, name)
    obj.name, obj.description, obj.is_active = name, data.description, data.is_active
    db.add(obj)
    await db.flush()
    await record_audit(
        db,
        tenant_id=tenant,
        actor_user_id=user.id,
        actor_name=user.full_name,
        action="expense_category.update" if identity else "expense_category.create",
        entity_type="expense_category",
        entity_id=str(obj.id),
        summary=f"Saved expense category {name}",
    )
    result = encoded(category_read(obj))
    await db.commit()
    return result


MAX_RECEIPT = 5 * 1024 * 1024


async def attach(
    db: AsyncSession,
    user: User,
    active: uuid.UUID | None,
    identity: uuid.UUID,
    content: bytes,
    filename: str,
) -> dict:
    obj = await require_record(db, user, active, identity, "update")
    if obj.status != "Pending":
        raise ValidationError("Only pending expenses can change receipts")
    if not content or len(content) > MAX_RECEIPT:
        raise ValidationError("Receipt must be between 1 byte and 5 MB")
    kind = (
        "application/pdf"
        if content.startswith(b"%PDF-")
        else "image/png"
        if content.startswith(b"\x89PNG\r\n\x1a\n")
        else "image/jpeg"
        if content.startswith(b"\xff\xd8\xff")
        else None
    )
    if not kind:
        raise ValidationError("Receipt must be a PDF, PNG or JPEG")
    key = uuid.uuid4().hex
    folder = Path(settings.EXPENSE_RECEIPT_DIR).resolve() / str(user.tenant_id)

    def write() -> None:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / key).write_bytes(content)

    await asyncio.to_thread(write)
    previous = obj.receipt_key
    obj.receipt_key, obj.receipt_name, obj.receipt_type = key, Path(filename).name[:255], kind
    try:
        await record_audit(
            db,
            tenant_id=user.tenant_id,
            actor_user_id=user.id,
            actor_name=user.full_name,
            action="expense.receipt",
            entity_type="expense",
            entity_id=str(identity),
            summary=f"Attached receipt to {obj.reference}",
        )
        await db.commit()
    except Exception:
        await asyncio.to_thread((folder / key).unlink, missing_ok=True)
        raise
    if previous:
        await asyncio.to_thread((folder / previous).unlink, missing_ok=True)
    return {"receipt_name": obj.receipt_name, "receipt_type": kind}


async def receipt(db: AsyncSession, user: User, active: uuid.UUID | None, identity: uuid.UUID):
    obj = await require_record(db, user, active, identity)
    if not obj.receipt_key:
        raise NotFoundError("No receipt attached")
    path = Path(settings.EXPENSE_RECEIPT_DIR).resolve() / str(user.tenant_id) / obj.receipt_key
    if not await asyncio.to_thread(path.is_file):
        raise NotFoundError("Receipt file is unavailable")
    return path, obj.receipt_name, obj.receipt_type
