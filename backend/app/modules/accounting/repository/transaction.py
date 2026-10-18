import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine


class TransactionRepository(BaseRepository[Transaction]):
    model = Transaction

    def _opts(self):
        return [selectinload(Transaction.lines).selectinload(TransactionLine.account)]

    async def get_by_id_for_tenant(self, tenant_id: uuid.UUID, id: uuid.UUID) -> Transaction | None:
        result = await self.db.execute(
            select(Transaction).options(*self._opts()).execution_options(populate_existing=True)
            .where(Transaction.id == id, Transaction.tenant_id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def list_for_tenant(self, tenant_id: uuid.UUID, type: str | None = None, status: str | None = None, offset: int = 0, limit: int = 50, branch_id: uuid.UUID | None = None) -> list[Transaction]:
        stmt = select(Transaction).options(*self._opts()).execution_options(populate_existing=True).where(Transaction.tenant_id == tenant_id)
        if branch_id:
            stmt = stmt.where(Transaction.branch_id == branch_id)
        if type:
            stmt = stmt.where(Transaction.type == type)
        if status:
            stmt = stmt.where(Transaction.status == status)
        stmt = stmt.order_by(Transaction.transaction_date.desc()).offset(offset).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_for_tenant(self, tenant_id: uuid.UUID, type: str | None = None, status: str | None = None, branch_id: uuid.UUID | None = None) -> int:
        stmt = select(func.count()).select_from(Transaction).where(Transaction.tenant_id == tenant_id)
        if branch_id:
            stmt = stmt.where(Transaction.branch_id == branch_id)
        if type:
            stmt = stmt.where(Transaction.type == type)
        if status:
            stmt = stmt.where(Transaction.status == status)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def next_reference(self, tenant_id: uuid.UUID) -> str:
        from sqlalchemy import Integer, cast
        from sqlalchemy.dialects.postgresql import insert

        from app.modules.accounting.models.workspace import JournalSequence
        # Atomic tenant sequence, seeded from existing numbered references; display references are separate from retry keys.
        existing = await self.db.get(JournalSequence, tenant_id)
        initial = 1
        if existing is None:
            initial = (await self.db.execute(select(func.coalesce(func.max(cast(func.substring(Transaction.reference, 5), Integer)), 0)).where(
                Transaction.tenant_id == tenant_id, Transaction.reference.op("~")(r"^TXN-[0-9]{1,9}$")))).scalar_one() + 1
        stmt = insert(JournalSequence).values(tenant_id=tenant_id, last_number=initial).on_conflict_do_update(
            index_elements=[JournalSequence.tenant_id], set_={"last_number": JournalSequence.last_number + 1}).returning(JournalSequence.last_number)
        return f"TXN-{(await self.db.execute(stmt)).scalar_one():04d}"

    async def by_client_reference(self, tenant_id: uuid.UUID, reference: str) -> Transaction | None:
        from sqlalchemy import or_
        return (await self.db.execute(select(Transaction).options(*self._opts()).execution_options(populate_existing=True).where(
            Transaction.tenant_id == tenant_id, or_(Transaction.client_reference == reference, Transaction.reference == reference)
        ))).scalar_one_or_none()

    async def save(self, obj: Transaction) -> Transaction:
        if obj.branch_id is None:
            from app.modules.procurement.models.purchase_order import PurchaseOrder
            from app.modules.sales.models.order import Order
            from app.modules.sales.models.return_ import Return
            if obj.order_id:
                obj.branch_id = (await self.db.execute(select(Order.branch_id).where(Order.id == obj.order_id, Order.tenant_id == obj.tenant_id))).scalar_one_or_none()
            elif obj.purchase_id:
                obj.branch_id = (await self.db.execute(select(PurchaseOrder.branch_id).where(PurchaseOrder.id == obj.purchase_id, PurchaseOrder.tenant_id == obj.tenant_id))).scalar_one_or_none()
            elif obj.return_id:
                obj.branch_id = (await self.db.execute(select(Order.branch_id).join(Return, Return.order_id == Order.id).where(Return.id == obj.return_id, Return.tenant_id == obj.tenant_id, Order.tenant_id == obj.tenant_id))).scalar_one_or_none()
        return await super().save(obj)

    async def by_reference(self, tenant_id: uuid.UUID, reference: str) -> Transaction | None:
        return (await self.db.execute(select(Transaction).options(*self._opts()).execution_options(populate_existing=True).where(
            Transaction.tenant_id == tenant_id, Transaction.reference == reference
        ))).scalar_one_or_none()

    async def locked(self, tenant_id: uuid.UUID, transaction_id: uuid.UUID) -> Transaction | None:
        return (await self.db.execute(select(Transaction).options(*self._opts()).execution_options(populate_existing=True).where(
            Transaction.tenant_id == tenant_id, Transaction.id == transaction_id
        ).with_for_update())).scalar_one_or_none()
