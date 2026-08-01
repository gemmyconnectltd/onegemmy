import uuid

from sqlalchemy import func, select

from app.core.repository import BaseRepository
from app.modules.finance.models.account import Account


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
