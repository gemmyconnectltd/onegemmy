import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.finance.models.transaction import Transaction
from app.modules.finance.models.transaction_line import TransactionLine


class TransactionRepository(BaseRepository[Transaction]):
    model = Transaction

    def _opts(self):
        return [selectinload(Transaction.lines).selectinload(TransactionLine.account)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Transaction | None:
        result = await self.db.execute(
            select(Transaction).options(*self._opts())
            .where(Transaction.id == id, Transaction.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, type: str | None = None, status: str | None = None, offset: int = 0, limit: int = 50) -> list[Transaction]:
        stmt = select(Transaction).options(*self._opts()).where(Transaction.tenant_id == tenant_id)
        if type:
            stmt = stmt.where(Transaction.type == type)
        if status:
            stmt = stmt.where(Transaction.status == status)
        stmt = stmt.order_by(Transaction.transaction_date.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, type: str | None = None, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(Transaction).where(Transaction.tenant_id == tenant_id)
        if type:
            stmt = stmt.where(Transaction.type == type)
        if status:
            stmt = stmt.where(Transaction.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        result = await self.db.execute(
            select(func.count()).select_from(Transaction).where(Transaction.tenant_id == tenant_id)
        )
        count = result.scalar_one()
        return f"TXN-{str(count + 1).zfill(4)}"
