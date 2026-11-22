import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError, ValidationError
from app.modules.accounting.service.workspace import allow
from app.modules.reporting.repository.daily import METRICS, DailyRepository
from app.modules.tenants.models import Tenant, User
from app.modules.tenants.repository import BranchRepository

DEFINITIONS = {
    "stock_value": "Stock value is the closing stock at the end of the day (stock ledger up to that moment) at today's cost price.",
    "sales": "Sales are completed sales, VAT included.",
    "customer_credit": "Debt is new credit given on that day (sales not paid at the till), not the customer's whole balance.",
    "expenses": "Expenses are approved expenses dated that day.",
    "deposits": "Deposit is cash moved out of a cash account into a bank or mobile-money account with Accounting → Transfer.",
    "bank": "Bank is customer payments received by bank transfer or card.",
    "momo": "MoMo is customer payments received by mobile money (MTN MoMo, Airtel Money).",
}


async def daily_report(db: AsyncSession, user: User, start: date | None, end: date | None,
                       branch_id: uuid.UUID | None, page: int = 1, page_size: int = 25, by_branch: bool = False) -> dict:
    """by_branch: one line per branch for the whole period (stock value at the end of its last day) instead of one per day."""
    tenant_id = allow(user, "journal_entries")
    # This combined report contains stock, debt and expense information.
    for resource in ("stock", "accounts_receivable", "expenses"):
        allow(user, resource)
    tenant = await db.get(Tenant, tenant_id)
    timezone = ZoneInfo(tenant.timezone)
    end = end or datetime.now(timezone).date()
    start = start or end
    if start > end or (end - start).days > 365:
        raise ValidationError("Select a date range of at most 366 days, with the start before the end")
    allowed = ([uuid.UUID(str(id)) for id in user.branch_ids] if user.branch_ids is not None
               else [user.branch_id] if user.branch_id else None)
    if branch_id:
        if allowed is not None and branch_id not in allowed:
            raise ForbiddenError("This branch is not assigned to your account")
        if await BranchRepository(db).get_by_id_for_tenant(tenant_id, branch_id) is None:
            raise ValidationError("Choose a branch belonging to this business")
        allowed = [branch_id]
    repo = DailyRepository(db)
    branch_repo = BranchRepository(db)
    main = await branch_repo.get_main_for_tenant(tenant_id)
    main_branch_id = main.id if main else None
    window = (datetime.combine(start, time.min, timezone), datetime.combine(end + timedelta(days=1), time.min, timezone))
    rows = await repo.activity(tenant_id, allowed, *window, tenant.timezone, start, end + timedelta(days=1), (page - 1) * page_size, page_size, by_branch)
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    stock, stock_source = await repo.stock_values(tenant_id, allowed, *window, tenant.timezone, days, main_branch_id)
    if (start == end or by_branch) and page == 1:
        # One line per branch: list every branch in scope, like the owner's sheet, even a branch that sold nothing.
        from sqlalchemy import select

        from app.modules.tenants.models import Branch
        stmt = select(Branch.id).where(Branch.tenant_id == tenant_id, Branch.status == "active").order_by(Branch.is_main.desc(), Branch.name)
        if allowed is not None:
            stmt = stmt.where(Branch.id.in_(allowed))
        seen = {row["branch_id"] for row in rows}
        totals_row = rows[0] if rows else {f"total_{m}": Decimal(0) for m in METRICS}
        for listed in (await db.execute(stmt)).scalars().all():
            if listed not in seen:
                rows.append({"day": end, "branch_id": listed, **{m: Decimal(0) for m in METRICS},
                             **{f"total_{m}": totals_row[f"total_{m}"] for m in METRICS}, "row_count": len(rows) + 1})
        for row in rows:
            row["row_count"] = len(rows)
    if stock_source == "current_stock" and page == 1 and any(stock.get((day, main_branch_id), Decimal(0)) for day in days):
        totals_row = rows[0] if rows else {f"total_{m}": Decimal(0) for m in METRICS}
        seen_keys = {(row["day"], row["branch_id"]) for row in rows}
        for day in days:
            key = (day, main_branch_id)
            if key in seen_keys:
                continue
            rows.append({"day": day, "branch_id": main_branch_id, **{m: Decimal(0) for m in METRICS},
                         **{f"total_{m}": totals_row[f"total_{m}"] for m in METRICS}, "row_count": len(rows) + 1})
            seen_keys.add(key)
        for row in rows:
            row["row_count"] = len(rows)
    for row in rows:
        row["stock_value"] = stock.get((row["day"], row["branch_id"]), Decimal(0))
    # Names are bounded by the tenant's branch directory, rather than a lookup per row.
    ids = {row["branch_id"] for row in rows if row["branch_id"]}
    names = await branch_repo.names_for_ids(tenant_id, ids)
    for row in rows:
        row["branch"] = names.get(row["branch_id"], "Unassigned (legacy records)")
    totals = {metric: rows[0][f"total_{metric}"] if rows else Decimal(0) for metric in METRICS}
    # Stock value is a balance, not a flow: the total is the closing value on the last day, across the branches in scope.
    totals["stock_value"] = sum((v for (day, _), v in stock.items() if day == end), Decimal(0))
    outstanding = await repo.outstanding_debt(tenant_id, allowed)
    definitions = dict(DEFINITIONS)
    if stock_source == "current_stock":
        definitions["stock_value"] += " The warehouse ledger has no movements, so current business-wide stock at cost is shown on the main branch."
    return {"outstanding_debt_now": outstanding, "from_date": start, "to_date": end, "currency": tenant.currency,
            "timezone": tenant.timezone, "definitions": definitions, "totals": totals,
            "metrics": ["stock_value", *METRICS],
            "items": rows, "total": rows[0]["row_count"] if rows else 0, "by_branch": by_branch,
            "page": page, "page_size": page_size}


async def daily_export_report(db: AsyncSession, user: User, start: date | None, end: date | None,
                              branch_id: uuid.UUID | None) -> dict:
    report = await daily_report(db, user, start, end, branch_id, 1, 500)
    page = 2
    while len(report["items"]) < report["total"]:
        batch = await daily_report(db, user, start, end, branch_id, page, 500)
        if not batch["items"]:
            break
        report["items"].extend(batch["items"])
        page += 1
    report["totals"] = {**{key: sum((Decimal(row[key]) for row in report["items"]), Decimal(0)) for key in METRICS},
                        "stock_value": report["totals"]["stock_value"]}
    return report


LABELS = {"stock_value": ("Stock value", "money"), "sales": ("Sales", "money"), "customer_credit": ("Debt", "money"),
          "expenses": ("Expense", "money"), "deposits": ("Deposit", "money"), "bank": ("Bank", "money"), "momo": ("MoMo", "money")}


def export_report(report: dict, format: str, tenant=None) -> bytes:
    """Daily branch activity through the shared business-branded writer (PDF, Excel or CSV from the same rows)."""
    import os
    import tempfile
    from datetime import UTC, datetime

    from app.modules.accounting.service.workspace_export import ExportWriter

    metrics = report.get("metrics", METRICS)
    columns = [{"key": "day", "label": "Date", "kind": "date"}, {"key": "branch", "label": "Branch", "kind": "text"}]
    columns += [{"key": m, "label": LABELS.get(m, (m.replace("_", " ").capitalize(), "money"))[0], "kind": LABELS.get(m, ("", "money"))[1]} for m in metrics]
    meta = {"id": "daily-branches", "kind": "daily-branches", "title": "Daily Report", "business": (getattr(tenant, "name", None) or "Business"),
            "currency": report["currency"], "branch": "Branches in scope", "from_date": str(report["from_date"]), "to_date": str(report["to_date"]),
            "as_of": str(report["to_date"]), "generated_at": datetime.now(UTC).isoformat(timespec="seconds"), "columns": columns,
            "totals": {**{f"Total {LABELS.get(m, (m, ''))[0].lower()}": report["totals"][m] for m in metrics},
                       "Outstanding customer debt now (not historical)": report.get("outstanding_debt_now", 0)},
            "notes": [f"Times are in {report['timezone']}.", *report["definitions"].values()],
            "quantity_totals": [f"Total {LABELS[m][0].lower()}" for m in metrics if LABELS.get(m, ("", "money"))[1] == "number"]}
    branches = sorted({row.get("branch") for row in report["items"] if row.get("branch")})
    meta["branch"] = branches[0] if len(branches) == 1 else "All branches in scope"
    with tempfile.NamedTemporaryFile(suffix=f".{format}", delete=False) as handle:
        path = handle.name
    try:
        writer = ExportWriter(path, format, meta, tenant)
        writer.rows([{**row, "day": str(row.get("day", ""))[:10]} for row in report["items"]])
        writer.finish()
        with open(path, "rb") as output:
            return output.read()
    finally:
        os.unlink(path)
