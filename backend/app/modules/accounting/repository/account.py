import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.accounting.models.account import Account


class AccountRepository(BaseRepository[Account]):
    model = Account

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Account | None:
        result = await self.db.execute(
            select(Account).where(Account.id == id, Account.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_code(self, tenant_id: uuid.UUID, code: str) -> Account | None:
        result = await self.db.execute(
            select(Account).where(Account.tenant_id == tenant_id, Account.code == code)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, type: str | None = None, offset: int = 0, limit: int = 100) -> list[Account]:
        stmt = select(Account).where(Account.tenant_id == tenant_id)
        if type:
            stmt = stmt.where(Account.type == type)
        stmt = stmt.order_by(Account.code).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, type: str | None = None) -> int:
        stmt = select(func.count()).select_from(Account).where(Account.tenant_id == tenant_id)
        if type:
            stmt = stmt.where(Account.type == type)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def used(self, tenant_id: uuid.UUID, account_id: uuid.UUID, posted: bool = False) -> bool:
        from app.modules.accounting.models.transaction import Transaction
        from app.modules.accounting.models.transaction_line import TransactionLine
        stmt = select(TransactionLine.id).join(Transaction).where(Transaction.tenant_id == tenant_id, TransactionLine.account_id == account_id)
        if posted:
            stmt = stmt.where(Transaction.status == "Posted")
        return (await self.db.execute(stmt.limit(1))).first() is not None

    async def filtered(self, tenant_id: uuid.UUID, search: str = "", type: str | None = None,
                       active: bool | None = None, offset: int = 0, limit: int = 50, cash_only: bool = False) -> tuple[list[Account], int]:
        from sqlalchemy import or_
        conditions = [Account.tenant_id == tenant_id]
        if cash_only:
            conditions.extend([Account.type == "Assets", Account.normal_balance == "debit", Account.code.startswith("10")])
        if search:
            conditions.append(or_(Account.name.ilike(f"%{search}%"), Account.code.ilike(f"%{search}%")))
        if type:
            conditions.append(Account.type == type)
        if active is not None:
            conditions.append(Account.is_active == active)
        total = (await self.db.execute(select(func.count()).select_from(Account).where(*conditions))).scalar_one()
        rows = (await self.db.execute(select(Account).where(*conditions).order_by(Account.code).offset(offset).limit(min(limit, 100)))).scalars().all()
        return list(rows), total

    async def get_many(self, tenant_id, ids=None, codes=None, active=None):
        stmt = select(Account).where(Account.tenant_id == tenant_id)
        if ids is not None:
            stmt = stmt.where(Account.id.in_(ids))
        if codes is not None:
            stmt = stmt.where(Account.code.in_(codes))
        if active is not None:
            stmt = stmt.where(Account.is_active.is_(active))
        return list((await self.db.execute(stmt)).scalars())

    async def stream_chart(self, tenant_id):
        stream = await self.db.stream(select(Account).where(Account.tenant_id == tenant_id).order_by(Account.code).execution_options(yield_per=100))
        async for account in stream.scalars():
            yield account

    async def has_children(self, tenant_id, id):
        return (await self.db.execute(select(Account.id).where(Account.tenant_id == tenant_id, Account.parent_id == id).limit(1))).first() is not None

    async def is_ancestor(self, tenant_id, parent_id, account_id):
        ancestors = select(Account.id, Account.parent_id).where(Account.id == parent_id, Account.tenant_id == tenant_id).cte("account_ancestors", recursive=True)
        ancestors = ancestors.union_all(select(Account.id, Account.parent_id).join(ancestors, Account.id == ancestors.c.parent_id).where(Account.tenant_id == tenant_id))
        return (await self.db.execute(select(ancestors.c.id).where(ancestors.c.id == account_id).limit(1))).first() is not None
