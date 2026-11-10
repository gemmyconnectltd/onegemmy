"""Bounded reads and database aggregation for the accounting workspace."""
import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import and_, case, func, or_, select, text
from sqlalchemy.orm import lazyload

from app.core.repository import BaseRepository
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.models.workspace import FinancialSnapshot, FinancialSnapshotRow

ZERO = Decimal(0)


_SOURCE_TYPES = {"sale": "Sale", "purchase": "Purchase", "return": "Return", "refund": "Refund", "payment": "Payment",
                 "supplier_payment": "Supplier payment", "supplier_return": "Supplier return", "expense": "Expense", "manual": "Manual journal",
                 "adjustment": "Adjustment", "transfer": "Transfer", "depreciation": "Depreciation", "payroll": "Payroll"}


def source_label(txn, order_number=None, purchase_ref=None, return_number=None) -> str:
    """A readable source for a journal: the document's own number when there is one, otherwise the journal's kind."""
    number = order_number or purchase_ref or return_number
    kind = _SOURCE_TYPES.get(txn.type, (txn.type or "Journal").replace("_", " ").capitalize())
    return f"{kind} {number}" if number else kind


class ReportingRepository(BaseRepository[FinancialSnapshot]):
    model = FinancialSnapshot

    async def lock_tenant(self, tenant_id: uuid.UUID) -> None:
        await self.db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": f"accounting:{tenant_id}"})

    def ledger(self, tenant_id: uuid.UUID, from_date: date | None = None,
               to_date: date | None = None, branch_id: uuid.UUID | None = None):
        stmt = select(TransactionLine, Transaction, Account).join(
            Transaction, Transaction.id == TransactionLine.transaction_id
        ).join(Account, and_(Account.id == TransactionLine.account_id, Account.tenant_id == Transaction.tenant_id))
        stmt = stmt.where(Transaction.tenant_id == tenant_id, Transaction.status == "Posted")
        if from_date:
            stmt = stmt.where(Transaction.transaction_date >= from_date)
        if to_date:
            stmt = stmt.where(Transaction.transaction_date <= to_date)
        if branch_id:
            stmt = stmt.where(Transaction.branch_id == branch_id)
        return stmt

    async def balances(self, tenant_id: uuid.UUID, from_date: date | None = None,
                       to_date: date | None = None, branch_id: uuid.UUID | None = None) -> dict:
        debit = func.coalesce(func.sum(case((TransactionLine.type == "debit", TransactionLine.amount), else_=0)), 0)
        credit = func.coalesce(func.sum(case((TransactionLine.type == "credit", TransactionLine.amount), else_=0)), 0)
        stmt = self.ledger(tenant_id, from_date, to_date, branch_id).with_only_columns(
            Account.id, Account.code, Account.name, Account.type, Account.normal_balance,
            debit.label("debit_total"), credit.label("credit_total"),
        ).group_by(Account.id).order_by(Account.code)
        rows = (await self.db.execute(stmt)).all()
        result = {}
        for row in rows:
            account = SimpleNamespace(id=row.id, code=row.code, name=row.name, type=row.type, normal_balance=row.normal_balance)
            debit_total, credit_total = Decimal(row.debit_total), Decimal(row.credit_total)
            result[row.id] = {"account": account, "debit_total": debit_total, "credit_total": credit_total,
                              "balance": debit_total - credit_total if row.type in {"Assets", "Expense"} else credit_total - debit_total}
        return result

    async def integrity(self, tenant_id: uuid.UUID, branch_id: uuid.UUID | None = None) -> None:
        from app.core.exceptions import ValidationError

        stmt = select(func.count()).select_from(TransactionLine).join(Transaction).join(Account).where(
            Transaction.tenant_id == tenant_id, Transaction.status == "Posted", Account.tenant_id != tenant_id)
        if branch_id:
            stmt = stmt.where(Transaction.branch_id == branch_id)
        if (await self.db.execute(stmt)).scalar_one():
            raise ValidationError("A posted journal references another business's account. Review the journal before reporting.")

    async def snapshot(self, tenant_id: uuid.UUID, snapshot_id: uuid.UUID) -> FinancialSnapshot | None:
        return (await self.db.execute(select(FinancialSnapshot).where(
            FinancialSnapshot.tenant_id == tenant_id, FinancialSnapshot.id == snapshot_id
        ))).scalar_one_or_none()

    async def rows(self, tenant_id: uuid.UUID, snapshot_id: uuid.UUID, offset: int, limit: int = 50) -> list[dict]:
        return list((await self.db.execute(select(FinancialSnapshotRow.data).where(
            FinancialSnapshotRow.tenant_id == tenant_id, FinancialSnapshotRow.snapshot_id == snapshot_id
        ).order_by(FinancialSnapshotRow.position).offset(offset).limit(min(limit, 100)))).scalars())

    async def row_totals(self, tenant_id: uuid.UUID, snapshot_id: uuid.UUID, fields: list[str]) -> dict:
        from sqlalchemy import Numeric, cast

        stmt = select(*[func.coalesce(func.sum(cast(FinancialSnapshotRow.data[field].astext, Numeric(24, 4))), 0).label(field)
                        for field in fields]).where(FinancialSnapshotRow.tenant_id == tenant_id, FinancialSnapshotRow.snapshot_id == snapshot_id)
        return dict((await self.db.execute(stmt)).one()._mapping)

    async def source_lines(self, tenant_id: uuid.UUID, from_date: date | None, to_date: date | None,
                           branch_id: uuid.UUID | None, account_id: uuid.UUID | None = None, search: str = "", cash_only: bool = False):
        stmt = self.ledger(tenant_id, from_date, to_date, branch_id).options(lazyload("*"))
        if account_id:
            stmt = stmt.where(Account.id == account_id)
        if cash_only:
            stmt = stmt.where(Account.type == "Assets", Account.code.startswith("10"))
        if search:
            like = f"%{search}%"
            stmt = stmt.where(or_(Transaction.reference.ilike(like), Transaction.description.ilike(like), Account.name.ilike(like)))
        # The source document's own number (sale, purchase, return), never its internal id: readable on screen and in exports.
        from app.modules.procurement.models.purchase_order import PurchaseOrder
        from app.modules.sales.models.order import Order
        from app.modules.sales.models.return_ import Return
        stmt = (stmt.outerjoin(Order, and_(Order.id == Transaction.order_id, Order.tenant_id == Transaction.tenant_id))
                .outerjoin(PurchaseOrder, and_(PurchaseOrder.id == Transaction.purchase_id, PurchaseOrder.tenant_id == Transaction.tenant_id))
                .outerjoin(Return, and_(Return.id == Transaction.return_id, Return.tenant_id == Transaction.tenant_id))
                .add_columns(Order.order_number, PurchaseOrder.reference, Return.return_number))
        stream = await self.db.stream(stmt.order_by(Transaction.transaction_date.desc(), Transaction.reference.desc(), Transaction.id, TransactionLine.id)
                                      .execution_options(yield_per=100))
        async for line, txn, account, order_number, purchase_ref, return_number in stream:
            yield {"id": str(line.id), "transaction_id": str(txn.id), "date": txn.transaction_date.isoformat(),
                   "reference": txn.reference, "transaction_reference": source_label(txn, order_number, purchase_ref, return_number),
                   "name": line.description or txn.description or "—", "account": f"{account.code} · {account.name}",
                   "debit": str(line.amount if line.type == "debit" else ZERO),
                   "credit": str(line.amount if line.type == "credit" else ZERO), "status": txn.status}

    async def ledger_page(self, tenant_id, from_date, to_date, account_id=None, branch_id=None, offset=0, limit=100):
        stmt = self.ledger(tenant_id, from_date, to_date, branch_id).options(lazyload("*"))
        if account_id:
            stmt = stmt.where(Account.id == account_id)
        totals = (await self.db.execute(stmt.with_only_columns(
            func.count().label("total"),
            func.coalesce(func.sum(case((TransactionLine.type == "debit", TransactionLine.amount), else_=0)), 0).label("debit"),
            func.coalesce(func.sum(case((TransactionLine.type == "credit", TransactionLine.amount), else_=0)), 0).label("credit")
        ))).one()
        rows = (await self.db.execute(stmt.order_by(Transaction.transaction_date, Transaction.id, TransactionLine.id).offset(offset).limit(min(limit, 100)))).all()
        return rows, totals
