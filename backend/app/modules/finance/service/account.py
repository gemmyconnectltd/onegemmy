import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.modules.finance.models.account import Account
from app.modules.finance.repository import AccountRepository
from app.modules.finance.schemas import AccountCreate, AccountRead, AccountUpdate

# Default chart of accounts seeded per tenant on first use
DEFAULT_ACCOUNTS = [
    ("1000", "Cash",                    "Assets",      "debit"),
    ("1100", "Accounts Receivable",     "Assets",      "debit"),
    ("1200", "Inventory",               "Assets",      "debit"),
    ("2000", "Accounts Payable",        "Liabilities", "credit"),
    ("3000", "Owner Equity",            "Equity",      "credit"),
    ("4000", "Sales Revenue",           "Revenue",     "credit"),
    ("5000", "Cost of Goods Sold",      "Expense",     "debit"),
    ("5100", "Rent Expense",            "Expense",     "debit"),
    ("5200", "Utilities Expense",       "Expense",     "debit"),
    ("5300", "Salaries Expense",        "Expense",     "debit"),
    ("5400", "Supplies Expense",        "Expense",     "debit"),
    ("5900", "Other Expense",           "Expense",     "debit"),
]


async def seed_default_accounts(db: AsyncSession, tenant_id: uuid.UUID) -> None:
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


async def create_account(db: AsyncSession, tenant_id: uuid.UUID, data: AccountCreate) -> AccountRead:
    repo = AccountRepository(db)
    existing = await repo.get_by_code(tenant_id, data.code)
    if existing:
        raise ConflictError(f"Account code {data.code} already exists")
    obj = Account(tenant_id=tenant_id, **data.model_dump())
    obj = await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, obj.id)
    return AccountRead.model_validate(obj)


async def update_account(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID, data: AccountUpdate) -> AccountRead:
    repo = AccountRepository(db)
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Account not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)
    await repo.save(obj)
    await db.commit()
    obj = await repo.get_by_id_for_tenant(tenant_id, id)
    return AccountRead.model_validate(obj)


async def delete_account(db: AsyncSession, tenant_id: uuid.UUID, id: uuid.UUID) -> None:
    obj = await AccountRepository(db).get_by_id_for_tenant(tenant_id, id)
    if obj is None:
        raise NotFoundError("Account not found")
    await AccountRepository(db).delete(obj)
    await db.commit()
