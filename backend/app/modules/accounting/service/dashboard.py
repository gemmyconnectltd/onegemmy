import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.modules.accounting.repository.workspace import WorkspaceRepository
from app.modules.accounting.service.statements import income_statement
from app.modules.accounting.service.workspace import allow, encoded, preference, resolve_branch
from app.modules.tenants.models import User


async def overview(db, user, active_branch=None):
    tenant_id = allow(user, "journal_entries")
    branch_id = await resolve_branch(db, user, None, active_branch)
    prefs = await preference(db, tenant_id)
    today = datetime.now(UTC).date()
    fiscal = prefs["fiscal_start_month"]
    start = date(today.year if today.month >= fiscal else today.year - 1, fiscal, 1)
    repo = WorkspaceRepository(db)
    await repo.integrity(tenant_id, branch_id)
    income = await income_statement(db, tenant_id, start, today, branch_id)
    balances = await repo.balances(tenant_id, to_date=today, branch_id=branch_id)
    cash = sum((v["balance"] for v in balances.values() if v["account"].type == "Assets" and v["account"].code.startswith("10")), Decimal(0))
    month_index = today.year * 12 + today.month - 1
    trend_start_index = month_index - 5
    trend_start = date(trend_start_index // 12, trend_start_index % 12 + 1, 1)
    grouped = await repo.trend(tenant_id, branch_id, trend_start, today)
    by_month = {r["month"].strftime("%Y-%m"): r for r in grouped}
    trend = []
    for index in range(trend_start_index, month_index + 1):
        key = f"{index // 12:04d}-{index % 12 + 1:02d}"
        row = by_month.get(key, {})
        trend.append({"month": key, "income": row.get("income", 0), "expenses": row.get("expenses", 0), "cash_change": row.get("cash_change", 0)})
    recent, _ = await repo.recent(tenant_id, branch_id, page_size=8)
    return encoded({"from_date": start, "to_date": today, "currency": prefs["ledger_currency"], "branch_id": branch_id,
                    "revenue": income.total_revenue + income.total_other_income, "expenses": income.total_cogs + income.total_operating_expenses,
                    "net_profit": income.net_income, "cash_balance": cash, "trend": trend, "journals": recent})


async def domain(db, user, view, page=1, page_size=25, period=None, active_branch=None):
    resources = {"cash": "banking", "assets": "fixed_assets", "reconciliations": "banking", "payroll": "payroll", "tax": "tax", "tax-payments": "tax", "pending": "journal_entries"}
    tenant_id = allow(user, resources[view])
    branch_id = await resolve_branch(db, user, None, active_branch)
    if branch_id and view in {"payroll", "tax", "tax-payments"}:
        raise ValidationError("These records are business-wide. Select All branches using an unrestricted finance account.")
    repo = WorkspaceRepository(db)
    negatives = []
    if view == "cash":
        accounts, total = await repo.cash_accounts(tenant_id, page, page_size)
        balances = await repo.balances(tenant_id, to_date=datetime.now(UTC).date(), branch_id=branch_id)
        rows = [{"id": a.id, "code": a.code, "name": a.name, "is_active": a.is_active,
                 "kind": "Mobile Money" if a.code.startswith("102") else "Bank" if a.code.startswith("101") else "Cash",
                 "balance": balances.get(a.id, {}).get("balance", Decimal(0))} for a in accounts]
        negatives = [{"id": v["account"].id, "name": v["account"].name, "balance": v["balance"]} for v in balances.values() if v["account"].type == "Assets" and v["account"].code.startswith("10") and v["balance"] < 0]
        totals = {"Cash & bank": sum((v["balance"] for v in balances.values() if v["account"].type == "Assets" and v["account"].code.startswith("10")), Decimal(0))}
    elif view == "pending":
        rows, total = await repo.recent(tenant_id, branch_id, "Draft", page, page_size)
        totals = {}
    else:
        rows, total, totals = await repo.list_domain(tenant_id, view, branch_id, page, page_size, period)
    return encoded({"items": rows, "total": total, "page": page, "page_size": page_size, "totals": totals, "negative_accounts": negatives[:5], "negative_count": len(negatives)})


async def income(db: AsyncSession, user: User, page: int = 1, page_size: int = 25,
                 start: date | None = None, end: date | None = None, status: str | None = None,
                 active_branch: uuid.UUID | None = None) -> dict:
    tenant_id = allow(user, "journal_entries")
    branch_id = await resolve_branch(db, user, None, active_branch)
    prefs = await preference(db, tenant_id)
    end = end or datetime.now(UTC).date()
    fiscal = prefs["fiscal_start_month"]
    start = start or date(end.year if end.month >= fiscal else end.year - 1, fiscal, 1)
    if start > end:
        raise ValidationError("From date must be on or before to date")
    result = await WorkspaceRepository(db).income(tenant_id, branch_id, start, end, page, page_size, status)
    return encoded({**result, "page": page, "page_size": page_size, "from_date": start, "to_date": end, "currency": prefs["ledger_currency"]})


async def cash_position(db: AsyncSession, user: User, account_id: uuid.UUID,
                        active_branch: uuid.UUID | None = None) -> dict:
    from app.modules.accounting.service.operations import account
    tenant_id = allow(user, "banking")
    branch_id = await resolve_branch(db, user, None, active_branch)
    row = await account(db, tenant_id, account_id, cash=True)
    balance = await WorkspaceRepository(db).cash_position(tenant_id, row.id, branch_id, datetime.now(UTC).date())
    return encoded({"id": row.id, "name": row.name, "balance": balance})
