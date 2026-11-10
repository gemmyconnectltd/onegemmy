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
    "collections": "Deposits means customer payments applied to sales, counted once as collections. Collections and bank transfers are not added to sales revenue.",
    "customer_credit": "New credit granted on this date, not the customer's current debt balance. Later repayments do not reduce credit granted.",
    "manufacturing": "Production and material consumption use inventory units recorded when a production order completes; wastage is included in material consumption, not added a second time.",
    "stock": "Stock in/out shows purchased/sold document quantities. It is not a branch stock balance. Historical restocks, wastage, returns, manufacturing and transfers are not included in these two totals.",
}


async def daily_report(db: AsyncSession, user: User, start: date | None, end: date | None,
                       branch_id: uuid.UUID | None, page: int = 1, page_size: int = 25) -> dict:
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
    from app.modules.tenants.service.feature import feature_enabled
    include_production = (user.is_superuser or "work_orders:read" in user.permissions_names) and await feature_enabled(db, tenant_id, "manufacturing")
    rows = await DailyRepository(db).activity(
        tenant_id, allowed, datetime.combine(start, time.min, timezone),
        datetime.combine(end + timedelta(days=1), time.min, timezone), tenant.timezone,
        start, end + timedelta(days=1), (page - 1) * page_size, page_size, include_production,
    )
    # Names are bounded by the tenant's branch directory, rather than a lookup per row.
    ids = {row["branch_id"] for row in rows if row["branch_id"]}
    names = await BranchRepository(db).names_for_ids(tenant_id, ids)
    for row in rows:
        row["branch"] = names.get(row["branch_id"], "Unassigned (legacy records)")
    totals = {metric: rows[0][f"total_{metric}"] if rows else Decimal(0) for metric in METRICS}
    outstanding = await DailyRepository(db).outstanding_debt(tenant_id, allowed)
    return {"outstanding_debt_now": outstanding, "from_date": start, "to_date": end, "currency": tenant.currency,
            "timezone": tenant.timezone, "definitions": {key: value for key, value in DEFINITIONS.items() if key != "manufacturing" or include_production}, "totals": totals,
            "metrics": list(METRICS if include_production else METRICS[:6]),
            "items": rows, "total": rows[0]["row_count"] if rows else 0,
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
    report["totals"] = {key: sum((Decimal(row[key]) for row in report["items"]), Decimal(0)) for key in METRICS}
    return report


LABELS = {"sales": ("Sales", "money"), "customer_credit": ("Credit granted", "money"), "collections": ("Collections", "money"),
          "expenses": ("Expenses", "money"), "stock_in": ("Stock in (qty)", "number"), "stock_out": ("Stock out (qty)", "number"),
          "production": ("Produced (qty)", "number"), "materials_consumed": ("Materials used (qty)", "number"), "wastage": ("Wastage (qty)", "number")}


def export_report(report: dict, format: str, tenant=None) -> bytes:
    """Daily branch activity through the shared business-branded writer (PDF, Excel or CSV from the same rows)."""
    import os
    import tempfile
    from datetime import UTC, datetime

    from app.modules.accounting.service.workspace_export import ExportWriter

    metrics = report.get("metrics", METRICS)
    columns = [{"key": "day", "label": "Date", "kind": "date"}, {"key": "branch", "label": "Branch", "kind": "text"}]
    columns += [{"key": m, "label": LABELS.get(m, (m.replace("_", " ").capitalize(), "money"))[0], "kind": LABELS.get(m, ("", "money"))[1]} for m in metrics]
    meta = {"id": "daily-branches", "kind": "daily-branches", "title": "Daily Branch Activity", "business": (getattr(tenant, "name", None) or "Business"),
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
