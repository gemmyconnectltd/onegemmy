import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.accounting.models.account import Account
from app.modules.accounting.repository import AccountRepository
from app.modules.accounting.schemas import AccountCreate, AccountRead, AccountUpdate
from app.modules.audit.service import record_audit

# Default chart of accounts seeded per tenant on first use
DEFAULT_ACCOUNTS = [
    ("1000", "Cash",                    "Assets",      "debit"),
    ("1010", "Bank",                    "Assets",      "debit"),
    ("1020", "Mobile Money",            "Assets",      "debit"),
    ("1500", "Equipment", "Assets", "debit"),
    ("1590", "Accumulated Depreciation", "Assets", "credit"),
    ("2150", "Payroll Deductions Payable", "Liabilities", "credit"),
    ("5500", "Depreciation Expense", "Expense", "debit"),
    ("4950", "Asset Disposal Gain", "Revenue", "credit"),
    ("5960", "Asset Disposal Loss", "Expense", "debit"),
    ("1150", "Input VAT Recoverable", "Assets", "debit"),
    ("2160", "PAYE Payable", "Liabilities", "credit"),
    ("2170", "Social Security / RSSB Payable", "Liabilities", "credit"),
    ("3100", "Retained Earnings", "Equity", "credit"),
    ("1100", "Accounts Receivable",     "Assets",      "debit"),
    ("1200", "Inventory",               "Assets",      "debit"),
    ("2000", "Accounts Payable",        "Liabilities", "credit"),
    ("2100", "VAT Payable",             "Liabilities", "credit"),
    ("3000", "Owner Equity",            "Equity",      "credit"),
    ("4000", "Sales Revenue",           "Revenue",     "credit"),
    ("4900", "Foreign Exchange Gain",   "Revenue",     "credit"),
    ("5000", "Cost of Goods Sold",      "Expense",     "debit"),
    ("5100", "Rent Expense",            "Expense",     "debit"),
    ("5200", "Utilities Expense",       "Expense",     "debit"),
    ("5300", "Salaries Expense",        "Expense",     "debit"),
    ("5400", "Supplies Expense",        "Expense",     "debit"),
    ("5900", "Other Expense",           "Expense",     "debit"),
    ("5950", "Foreign Exchange Loss",   "Expense",     "debit"),
]


async def seed_default_accounts(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    from app.modules.accounting.repository.reporting import ReportingRepository
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = AccountRepository(db)
    for code, name, type_, normal_balance in DEFAULT_ACCOUNTS:
        existing = await repo.get_by_code(tenant_id, code)
        if not existing:
            obj = Account(tenant_id=tenant_id, code=code, name=name, type=type_, normal_balance=normal_balance)
            await repo.save(obj)
    await db.commit()


async def list_accounts(db: AsyncSession, tenant_id: uuid.UUID, type: str | None = None, offset: int = 0, limit: int = 100) -> list[AccountRead]:
    items = await AccountRepository(db).list_for_tenant(tenant_id, type, offset, limit)
    return [AccountRead.model_validate(i) for i in items]


async def count_accounts(db: AsyncSession, tenant_id: uuid.UUID, type: str | None = None) -> int:
    return await AccountRepository(db).count_for_tenant(tenant_id, type)


async def get_account(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> AccountRead:
    obj = await AccountRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Account not found")
    return AccountRead.model_validate(obj)


async def create_account(db: AsyncSession, tenant_id: uuid.UUID, data: AccountCreate, actor=None) -> AccountRead:
    if actor is not None:
        from app.modules.accounting.service.workspace import allow
        allow(actor, "chart_of_accounts", "create")
    from app.modules.accounting.repository.reporting import ReportingRepository
    await ReportingRepository(db).lock_tenant(tenant_id)
    await validate_parent(db, tenant_id, data.parent_id, data.type)
    repo = AccountRepository(db)
    existing = await repo.get_by_code(tenant_id, data.code)
    if existing:
        raise ConflictError(f"Account code {data.code} already exists")
    obj = Account(tenant_id=tenant_id, **data.model_dump())
    obj = await repo.save(obj)
    if actor is not None:
        await record_audit(db, tenant_id=tenant_id, actor_user_id=actor.id, action="account.create", entity_type="account", entity_id=str(obj.id), summary=f"Created chart account {obj.code}")
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return AccountRead.model_validate(obj)


async def update_account(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: AccountUpdate, actor=None) -> AccountRead:
    from app.modules.accounting.repository.reporting import ReportingRepository
    await ReportingRepository(db).lock_tenant(tenant_id)
    repo = AccountRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Account not found")
    if actor is not None:
        from app.modules.accounting.service.workspace import allow
        allow(actor, "chart_of_accounts", "update")
    updates = data.model_dump(exclude_unset=True)
    if "name" in updates and not updates["name"]:
        raise ValidationError("Account name cannot be empty")
    if (any(key in updates and updates[key] != getattr(obj, key) for key in ("parent_id", "group_name")) or (updates.get("is_active") is False and obj.is_active)) and await repo.used(tenant_id, id, posted=True):
        raise ValidationError("Posted accounts cannot be regrouped, reparented or deactivated; create a new account")
    if "parent_id" in updates:
        await validate_parent(db, tenant_id, updates["parent_id"], obj.type, id)
    for field, value in updates.items():
        setattr(obj, field, value)
    await repo.save(obj)
    if actor is not None:
        await record_audit(db, tenant_id=tenant_id, actor_user_id=actor.id, action="account.update", entity_type="account", entity_id=str(obj.id), summary=f"Updated chart account {obj.code}")
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return AccountRead.model_validate(obj)


async def delete_account(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, actor=None) -> None:
    obj = await AccountRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Account not found")
    if actor is not None:
        from app.modules.accounting.service.workspace import allow
        allow(actor, "chart_of_accounts", "delete")
    if await AccountRepository(db).used(tenant_id, id):
        raise ValidationError("Accounts used by journals cannot be deleted")
    if await AccountRepository(db).has_children(tenant_id, id):
        raise ValidationError("Remove or reassign child accounts first")
    await AccountRepository(db).delete(obj)
    if actor is not None:
        await record_audit(db, tenant_id=tenant_id, actor_user_id=actor.id, action="account.delete", entity_type="account", entity_id=str(id), summary=f"Deleted unused chart account {obj.code}")
    await db.commit()


async def validate_parent(db: AsyncSession, tenant_id: uuid.UUID, parent_id: uuid.UUID | None,
                          type_: str, account_id: uuid.UUID | None = None) -> None:
    if parent_id is None:
        return
    if parent_id == account_id:
        raise ValidationError("An account cannot be its own parent")
    parent = await AccountRepository(db).get_by_id_for_tenant(tenant_id, parent_id)
    if parent is None or parent.type != type_:
        raise ValidationError("Parent must belong to this business and have the same account type")
    if account_id and await AccountRepository(db).is_ancestor(tenant_id, parent_id, account_id):
        raise ValidationError("Account hierarchy would contain a cycle")
