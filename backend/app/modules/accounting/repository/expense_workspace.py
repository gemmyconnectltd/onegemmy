import uuid
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import selectinload

from app.core.repository import BaseRepository
from app.modules.accounting.models.account import Account
from app.modules.accounting.models.expense import Expense, ExpenseCategory
from app.modules.accounting.schemas.expense_workspace import ExpenseFilters
from app.modules.audit.models import AuditLog
from app.modules.inventory.models.supplier import Supplier
from app.modules.sales.models.order import Order


class ExpenseWorkspaceRepository(BaseRepository[Expense]):
    model = Expense

    def filtered(self, tenant: uuid.UUID, branch: uuid.UUID | None, filters: ExpenseFilters):
        query = select(Expense).where(Expense.tenant_id == tenant)
        if branch:
            query = query.where(Expense.branch_id == branch)
        for field in ("category", "payment_method", "status"):
            value = getattr(filters, field)
            if value:
                query = query.where(getattr(Expense, field) == value)
        if filters.from_date:
            query = query.where(Expense.expense_date >= filters.from_date)
        if filters.to_date:
            query = query.where(Expense.expense_date <= filters.to_date)
        if filters.search:
            pattern = (
                "%"
                + filters.search.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
                + "%"
            )
            query = query.where(
                or_(
                    Expense.title.ilike(pattern),
                    Expense.reference.ilike(pattern),
                    Expense.reference_number.ilike(pattern),
                )
            )
        return query

    async def records(self, query, offset: int, limit: int):
        total = await self.db.scalar(select(func.count()).select_from(query.subquery()))
        items = (
            (
                await self.db.execute(
                    query.options(selectinload(Expense.account))
                    .order_by(Expense.expense_date.desc(), Expense.id.desc())
                    .offset(offset)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return list(items), total

    async def summary(self, query) -> dict[str, Any]:
        rows = query.subquery()
        amount = func.coalesce(rows.c.base_amount, rows.c.amount)
        total, count = (
            await self.db.execute(
                select(func.coalesce(func.sum(amount), 0), func.count()).select_from(rows)
            )
        ).one()
        categories = (
            (
                await self.db.execute(
                    select(
                        rows.c.category.label("name"),
                        func.sum(amount).label("amount"),
                        func.count().label("count"),
                    )
                    .group_by(rows.c.category)
                    .order_by(func.sum(amount).desc())
                    .limit(20)
                )
            )
            .mappings()
            .all()
        )
        # A bounded display plus a truthful grouped remainder; totals always span the full period.
        return {
            "total": total,
            "count": count,
            "categories": [dict(row) for row in categories],
            "other_amount": total - sum((row["amount"] for row in categories), 0),
        }

    async def one(
        self, tenant: uuid.UUID, branch: uuid.UUID | None, identity: uuid.UUID, lock: bool = False
    ) -> Expense | None:
        query = (
            self.filtered(tenant, branch, ExpenseFilters())
            .where(Expense.id == identity)
            .options(selectinload(Expense.account))
        )
        if lock:
            query = query.with_for_update()
        return (
            await self.db.execute(query.execution_options(populate_existing=True))
        ).scalar_one_or_none()

    async def history(self, tenant: uuid.UUID, identity: uuid.UUID, page: int):
        query = select(AuditLog).where(
            AuditLog.tenant_id == tenant,
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == str(identity),
        )
        total = await self.db.scalar(select(func.count()).select_from(query.subquery()))
        logs = (
            (
                await self.db.execute(
                    query.order_by(AuditLog.created_at.desc(), AuditLog.id)
                    .offset((page - 1) * 20)
                    .limit(20)
                )
            )
            .scalars()
            .all()
        )
        return [
            {
                "action": row.action,
                "summary": row.summary,
                "actor": row.actor_name,
                "date": row.created_at,
            }
            for row in logs
        ], total

    async def categories(self, tenant: uuid.UUID, page: int, search: str = ""):
        query = select(ExpenseCategory).where(ExpenseCategory.tenant_id == tenant)
        if search:
            query = query.where(ExpenseCategory.name.ilike(f"%{search}%"))
        total = await self.db.scalar(select(func.count()).select_from(query.subquery()))
        items = (
            (
                await self.db.execute(
                    query.order_by(ExpenseCategory.name).offset((page - 1) * 25).limit(25)
                )
            )
            .scalars()
            .all()
        )
        return items, total

    async def category(self, tenant: uuid.UUID, identity: uuid.UUID) -> ExpenseCategory | None:
        return (
            await self.db.execute(
                select(ExpenseCategory)
                .where(ExpenseCategory.tenant_id == tenant, ExpenseCategory.id == identity)
                .with_for_update()
            )
        ).scalar_one_or_none()

    async def category_by_name(self, tenant: uuid.UUID, name: str) -> ExpenseCategory | None:
        return (
            await self.db.execute(
                select(ExpenseCategory).where(
                    ExpenseCategory.tenant_id == tenant,
                    func.lower(ExpenseCategory.name) == name.lower(),
                )
            )
        ).scalar_one_or_none()

    async def rename_category(self, tenant: uuid.UUID, previous: str, name: str) -> None:
        await self.db.execute(
            update(Expense)
            .where(Expense.tenant_id == tenant, Expense.category == previous)
            .values(category=name)
        )

    async def retry(self, tenant: uuid.UUID, key: str) -> Expense | None:
        return (
            await self.db.execute(
                select(Expense)
                .options(selectinload(Expense.account))
                .where(Expense.tenant_id == tenant, Expense.client_reference == key)
            )
        ).scalar_one_or_none()

    async def linked_record(self, tenant: uuid.UUID, field: str, identity: uuid.UUID):
        model = {"supplier_id": Supplier, "account_id": Account, "order_id": Order}[field]
        return (
            await self.db.execute(
                select(model).where(model.tenant_id == tenant, model.id == identity)
            )
        ).scalar_one_or_none()

    async def supplier_name(self, tenant: uuid.UUID, identity: uuid.UUID) -> str | None:
        return await self.db.scalar(
            select(Supplier.name).where(Supplier.tenant_id == tenant, Supplier.id == identity)
        )
