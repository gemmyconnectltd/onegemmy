import csv
import io
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table
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


def export_report(report: dict, format: str) -> bytes:
    metrics = report.get("metrics", METRICS)
    columns = ("day", "branch", *metrics)
    rows = [[str(row.get(key, "")) for key in columns] for row in report["items"]]
    rows.append(["TOTAL", "", *(str(report["totals"][key]) for key in metrics)])
    if format == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["Daily branch activity", report["currency"], report["timezone"], report["from_date"], report["to_date"]])
        writer.writerow(["Current outstanding customer debt (not historical)", report.get("outstanding_debt_now", 0)])
        writer.writerow(columns)
        writer.writerows(rows)
        for key, definition in report["definitions"].items():
            writer.writerow([key, definition])
        return out.getvalue().encode("utf-8-sig")
    out = io.BytesIO()
    styles = getSampleStyleSheet()
    width = landscape(A4)[0] - 48
    column_widths = [60, 110] + [(width - 170) / len(metrics)] * len(metrics)
    header_style = styles["Normal"].clone("table-header", fontSize=7, leading=9)
    body_style = styles["Normal"].clone("table-body", fontSize=7, leading=9)
    formatted = [[Paragraph(escape(str(value)), header_style if index == 0 else body_style)
                  for value in row] for index, row in enumerate([list(columns), *rows])]
    flow = [Paragraph(f"Daily branch activity ({report['currency']})", styles["Title"]),
            Paragraph(f"{report['from_date']} to {report['to_date']} · {report['timezone']}", styles["Normal"]),
            Paragraph(f"Current outstanding customer debt: {report.get('outstanding_debt_now', 0)} (not historical)", styles["Normal"]),
            Spacer(1, 12), Table(formatted, colWidths=column_widths, repeatRows=1,
                style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)])]
    flow.extend(Paragraph(definition, styles["Normal"]) for definition in report["definitions"].values())
    SimpleDocTemplate(out, pagesize=landscape(A4), leftMargin=24, rightMargin=24).build(flow)
    return out.getvalue()
