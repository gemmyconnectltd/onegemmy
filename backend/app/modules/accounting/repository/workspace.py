import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import lazyload

from app.modules.accounting.models.account import Account
from app.modules.accounting.models.tax import TaxCalculation, TaxPayment
from app.modules.accounting.models.transaction import Transaction
from app.modules.accounting.models.transaction_line import TransactionLine
from app.modules.accounting.models.workspace import BankReconciliation, FixedAsset
from app.modules.accounting.repository.reporting import ReportingRepository
from app.modules.hr.models.employee import Employee
from app.modules.hr.models.payroll import PayrollEntry


class WorkspaceRepository(ReportingRepository):
    async def recent(self, tenant_id: uuid.UUID, branch_id: uuid.UUID | None, status: str = "Posted", page: int = 1, page_size: int = 25) -> tuple[list[dict], int]:
        conditions = [Transaction.tenant_id == tenant_id, Transaction.status == status]
        if branch_id:
            conditions.append(Transaction.branch_id == branch_id)
        total = (await self.db.execute(select(func.count()).select_from(Transaction).where(*conditions))).scalar_one()
        stmt = select(Transaction.id, Transaction.reference, Transaction.transaction_date, Transaction.description, Transaction.status, Transaction.type,
                      func.coalesce(func.sum(case((TransactionLine.type == "debit", TransactionLine.amount), else_=0)), 0).label("debit"),
                      func.coalesce(func.sum(case((TransactionLine.type == "credit", TransactionLine.amount), else_=0)), 0).label("credit")).outerjoin(
            TransactionLine, TransactionLine.transaction_id == Transaction.id).where(*conditions).group_by(Transaction.id).order_by(
            Transaction.transaction_date.desc(), Transaction.created_at.desc(), Transaction.id).offset((page - 1) * page_size).limit(min(page_size, 100))
        return [dict(r._mapping) for r in (await self.db.execute(stmt)).all()], total

    async def trend(self, tenant_id: uuid.UUID, branch_id: uuid.UUID | None, start: date, end: date) -> list[dict]:
        month = func.date_trunc("month", Transaction.transaction_date)
        signed = case((TransactionLine.type == "debit", TransactionLine.amount), else_=-TransactionLine.amount)
        stmt = self.ledger(tenant_id, start, end, branch_id).with_only_columns(
            month.label("month"), func.sum(case((Account.type == "Revenue", -signed), else_=0)).label("income"),
            func.sum(case((Account.type == "Expense", signed), else_=0)).label("expenses"),
            func.sum(case((and_(Account.type == "Assets", Account.code.startswith("10")), signed), else_=0)).label("cash_change"),
        ).group_by(month).order_by(month)
        return [dict(r._mapping) for r in (await self.db.execute(stmt)).all()]

    async def list_domain(self, tenant_id: uuid.UUID, view: str, branch_id: uuid.UUID | None,
                          page: int, page_size: int, period: str | None = None) -> tuple[list[dict], int, dict]:
        models = {"assets": FixedAsset, "reconciliations": BankReconciliation, "payroll": PayrollEntry,
                  "tax": TaxCalculation, "tax-payments": TaxPayment}
        model = models[view]
        conditions = [model.tenant_id == tenant_id]
        if branch_id:
            conditions.append(model.branch_id == branch_id)
        if period and view in {"payroll", "tax", "tax-payments"}:
            conditions.append(model.period == period)
        total = (await self.db.execute(select(func.count()).select_from(model).where(*conditions))).scalar_one()
        stmt = select(model).options(lazyload("*")).where(*conditions).order_by(model.created_at.desc(), model.id).offset((page - 1) * page_size).limit(min(page_size, 100))
        if view == "payroll":
            stmt = select(model, (Employee.first_name + " " + Employee.last_name)).join(Employee, and_(Employee.id == model.employee_id, Employee.tenant_id == tenant_id)).where(*conditions).order_by(model.period.desc(), model.id).offset((page - 1) * page_size).limit(min(page_size, 100))
            # Legacy Employee uses first_name/last_name? Select its mapped display field only.
            records = (await self.db.execute(stmt)).all()
            rows = []
            for record, name in records:
                row = {c.name: getattr(record, c.name) for c in model.__table__.columns}
                row["employee"] = name
                row["gross"] = record.base_salary + record.bonus
                rows.append(row)
            references = [f"PAYROLL-{r['id'].hex}" for r in rows]
            posted = set((await self.db.execute(select(Transaction.reference).where(Transaction.tenant_id == tenant_id, Transaction.status == "Posted", Transaction.reference.in_(references)))).scalars()) if references else set()
            for row in rows:
                row["posting_status"] = "Posted" if f"PAYROLL-{row['id'].hex}" in posted else "Not posted"
        else:
            if view == "reconciliations":
                stmt = select(model, Account.code, Account.name).join(Account, and_(Account.id == model.account_id, Account.tenant_id == tenant_id)).where(*conditions).order_by(model.created_at.desc(), model.id).offset((page - 1) * page_size).limit(min(page_size, 100))
                records = (await self.db.execute(stmt)).all()
                rows = [{**{c.name: getattr(record, c.name) for c in model.__table__.columns}, "account": f"{code} · {name}"} for record, code, name in records]
            else:
                records = (await self.db.execute(stmt)).scalars().all()
                rows = [{c.name: getattr(record, c.name) for c in model.__table__.columns} for record in records]
        if view == "assets":
            totals = (await self.db.execute(select(func.coalesce(func.sum(model.cost), 0).label("cost"), func.coalesce(func.sum(model.accumulated), 0).label("depreciation"),
                                                    func.coalesce(func.sum(model.cost - model.accumulated), 0).label("net_book_value")).where(*conditions, model.disposed_on.is_(None)))).one()._mapping
        elif view == "payroll":
            totals = (await self.db.execute(select(func.coalesce(func.sum(model.base_salary + model.bonus), 0).label("gross"), func.coalesce(func.sum(model.deductions), 0).label("deductions"), func.coalesce(func.sum(model.net_pay), 0).label("net_pay")).where(*conditions))).one()._mapping
        elif view == "tax":
            totals = (await self.db.execute(select(func.coalesce(func.sum(model.tax_amount), 0).label("obligations")).where(*conditions, model.status != "Void"))).one()._mapping
        else:
            totals = {}
        return rows, total, dict(totals)

    async def cash_accounts(self, tenant_id, page, page_size):
        conditions = [Account.tenant_id == tenant_id, Account.type == "Assets", Account.code.startswith("10")]
        total = (await self.db.execute(select(func.count()).select_from(Account).where(*conditions))).scalar_one()
        rows = (await self.db.execute(select(Account).where(*conditions).order_by(Account.code).offset((page - 1) * page_size).limit(min(page_size, 100)))).scalars().all()
        return rows, total

    async def record(self, model, tenant_id, *, id=None, reference=None, lock=False):
        stmt = select(model).where(model.tenant_id == tenant_id)
        if id is not None:
            stmt = stmt.where(model.id == id)
        if reference is not None:
            stmt = stmt.where(model.reference == reference)
        if lock:
            stmt = stmt.with_for_update(of=model)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def allocated_asset_cost(self, tenant_id, transaction_id, account_id):
        return (await self.db.execute(select(func.coalesce(func.sum(FixedAsset.cost), 0)).where(
            FixedAsset.tenant_id == tenant_id, FixedAsset.acquisition_transaction_id == transaction_id,
            FixedAsset.asset_account_id == account_id))).scalar_one()

    @staticmethod
    def _revenue_lines(tenant_id: uuid.UUID, branch_id: uuid.UUID | None, start: date, end: date, *columns):
        """The one revenue formula, shared by the Income page and the dashboard: net credits (credits − debits) on
        Revenue-type accounts, by transaction date, optionally one branch. Revenue lines are posted net of VAT (VAT goes
        to its own tax account), so the amounts exclude VAT. Callers choose their columns and status filter."""
        stmt = select(*columns).select_from(Transaction).join(
            TransactionLine, TransactionLine.transaction_id == Transaction.id).join(Account, and_(
                Account.id == TransactionLine.account_id, Account.tenant_id == tenant_id)).where(
                Transaction.tenant_id == tenant_id, Account.type == "Revenue",
                Transaction.transaction_date >= start, Transaction.transaction_date <= end)
        if branch_id:
            stmt = stmt.where(Transaction.branch_id == branch_id)
        return stmt

    REVENUE = case((TransactionLine.type == "credit", TransactionLine.amount), else_=-TransactionLine.amount)

    async def income(self, tenant_id: uuid.UUID, branch_id: uuid.UUID | None, start: date,
                     end: date, page: int, page_size: int, status: str | None = None) -> dict:
        """Revenue-only amounts and full-period totals; never sum a truncated journal page."""
        stmt = self._revenue_lines(tenant_id, branch_id, start, end, Transaction.id, Transaction.reference, Transaction.transaction_date,
                                   Transaction.description, Transaction.status, Transaction.type, func.sum(self.REVENUE).label("amount"))
        grouped = stmt.group_by(Transaction.id).subquery()
        totals = (await self.db.execute(select(
            func.coalesce(func.sum(case((grouped.c.status == "Posted", grouped.c.amount), else_=0)), 0).label("posted"),
            func.coalesce(func.sum(case((grouped.c.status == "Draft", grouped.c.amount), else_=0)), 0).label("draft"),
        ))).one()._mapping
        conditions = [grouped.c.status == status] if status else []
        total = (await self.db.execute(select(func.count()).select_from(grouped).where(*conditions))).scalar_one()
        rows = (await self.db.execute(select(grouped).where(*conditions).order_by(grouped.c.transaction_date.desc(), grouped.c.reference.desc()).offset((page-1)*page_size).limit(min(page_size, 100)))).mappings().all()
        return {"items": [dict(row) for row in rows], "total": total, "totals": dict(totals)}

    async def revenue_summary(self, tenant_id: uuid.UUID, branch_id: uuid.UUID | None, start: date, end: date, timezone: str) -> dict:
        """Posted revenue for the dashboard, split into sales and other income by the one P&L rule (service/pnl_sections.py,
        the same split as the income statement), with each per day and, for a single day, per local hour. One query."""
        from app.modules.accounting.service.pnl_sections import SALES, section_sql
        hour = func.extract("hour", func.timezone(timezone, Transaction.created_at)).label("hour")
        rows = (await self.db.execute(
            self._revenue_lines(tenant_id, branch_id, start, end, Transaction.transaction_date.label("day"), hour,
                                (section_sql(Account) == SALES).label("is_sales"),
                                func.sum(self.REVENUE).label("amount"))
            .where(Transaction.status == "Posted").group_by("day", "hour", "is_sales")
        )).all()
        # Per day and (one-day ranges) per local hour, for each series, so the dashboard chart adds up to the cards exactly.
        by_day: dict[bool, dict[date, Decimal]] = {True: {}, False: {}}
        by_hour: dict[bool, dict[int, Decimal]] = {True: {}, False: {}}
        for r in rows:
            kind, value = bool(r.is_sales), Decimal(r.amount)
            by_day[kind][r.day] = by_day[kind].get(r.day, Decimal(0)) + value
            by_hour[kind][int(r.hour)] = by_hour[kind].get(int(r.hour), Decimal(0)) + value
        sales, other_income = sum(by_day[True].values(), Decimal(0)), sum(by_day[False].values(), Decimal(0))
        days = lambda kind: [{"date": d, "amount": a} for d, a in sorted(by_day[kind].items())]
        hours = lambda kind: [{"hour": h, "amount": a} for h, a in sorted(by_hour[kind].items())] if start == end else []
        return {
            "sales_revenue": sales, "other_income": other_income, "total_revenue": sales + other_income,
            "sales_by_day": days(True), "sales_by_hour": hours(True),
            "other_income_by_day": days(False), "other_income_by_hour": hours(False),
        }

    async def cash_position(self, tenant_id: uuid.UUID, account_id: uuid.UUID, branch_id: uuid.UUID | None, as_of: date) -> Decimal:
        signed = case((TransactionLine.type == "debit", TransactionLine.amount), else_=-TransactionLine.amount)
        stmt = self.ledger(tenant_id, to_date=as_of, branch_id=branch_id).with_only_columns(func.coalesce(func.sum(signed), 0)).where(Account.id == account_id)
        return (await self.db.execute(stmt)).scalar_one()
