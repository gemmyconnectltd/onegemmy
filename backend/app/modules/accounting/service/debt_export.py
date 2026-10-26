"""Excel / PDF / CSV exports for debt lists and statements, written by the shared bounded export writer."""
import asyncio
import os
import tempfile
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.accounting.repository.debt import DebtRepository
from app.modules.accounting.schemas.debt import DebtFilters, DebtKind
from app.modules.accounting.service import debt as base
from app.modules.accounting.service.debt_statement import statement
from app.modules.accounting.service.workspace import columns, encoded
from app.modules.accounting.service.workspace_export import ExportWriter
from app.modules.tenants.models.branch import Branch
from app.modules.tenants.models.tenant import Tenant
from app.modules.tenants.models.user import User

MEDIA = {"pdf": "application/pdf", "csv": "text/csv; charset=utf-8",
         "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
LIMIT = 5000


async def _header(db: AsyncSession, tenant: uuid.UUID, branch: uuid.UUID | None, title: str, currency: str) -> dict:
    name = (await db.execute(select(Tenant.name).where(Tenant.id == tenant))).scalar_one()
    branch_name = (await db.execute(select(Branch.name).where(Branch.id == branch))).scalar_one() if branch else "All branches"
    today = datetime.now(UTC).date().isoformat()
    return {"id": title.lower().replace(" ", "-"), "kind": title.lower().replace(" ", "-"), "title": title, "business": name,
            "currency": currency, "branch": branch_name, "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "as_of": today, "from_date": today, "to_date": today, "totals": {}, "notes": []}


async def _write(report: dict, rows: list[dict], fmt: str) -> str:
    with tempfile.NamedTemporaryFile(prefix="pesaa-debt-", suffix=f".{fmt}", delete=False) as file:
        path = file.name
    try:
        writer = await asyncio.to_thread(ExportWriter, path, fmt, report)
        await asyncio.to_thread(writer.rows, rows)
        await asyncio.to_thread(writer.finish)
    except BaseException:
        os.unlink(path)
        raise
    return path


async def export_list(db: AsyncSession, user: User, kind: DebtKind, active, filters: DebtFilters, fmt: str,
                      ids: list[uuid.UUID] | None = None) -> tuple[str, str, str]:
    tenant, branch, currency = await base.context(db, user, kind, active)
    repo = DebtRepository(db)
    today = datetime.now(UTC).date()
    rows = repo.filtered(repo.projection(tenant, kind, currency, branch, today), filters)
    items = await repo.page(rows, 0, LIMIT)
    if ids:
        wanted = {str(i) for i in ids}
        items = [i for i in items if str(i["id"]) in wanted]
    label = "Receivables" if kind == "receivable" else "Payables"
    report = await _header(db, tenant, branch, label, currency)
    report["columns"] = columns(("name", "Customer" if kind == "receivable" else "Supplier", "text"), ("reference", "Reference", "text"),
                                ("issue_date", "Issued", "text"), ("due_date", "Due", "text"), ("original", "Original", "money"),
                                ("paid", "Paid", "money"), ("written_off", "Written off", "money"),
                                ("outstanding", "Outstanding", "money"), ("status", "Status", "text"))
    encoded_items = encoded(items)
    report["totals"] = {"Records": len(encoded_items)}
    if len(items) >= LIMIT:
        report["notes"].append(f"Limited to the first {LIMIT} records; narrow the filters for the rest.")
    path = await _write(report, encoded_items, fmt)
    return path, f"{label.lower()}-{today.isoformat()}.{fmt}", MEDIA[fmt]


async def export_statement(db: AsyncSession, user: User, kind: DebtKind, active, party_id: uuid.UUID, date_from, date_to,
                           fmt: str) -> tuple[str, str, str]:
    data = await statement(db, user, kind, active, party_id, date_from, date_to)
    tenant = user.tenant_id
    report = await _header(db, tenant, uuid.UUID(data["branch_id"]) if data["branch_id"] else None,
                           f"Statement - {data['party']['name']}", data["currency"])
    report.update(from_date=str(data["date_from"]), to_date=str(data["date_to"]), as_of=str(data["date_to"]))
    report["columns"] = columns(("date", "Date", "text"), ("reference", "Reference", "text"), ("description", "Description", "text"),
                                ("debit", "Debit", "money"), ("credit", "Credit", "money"), ("balance", "Running balance", "money"))
    report["totals"] = {"Opening balance": data["opening"], "Total billed": data["totals"]["billed"],
                        "Total paid": data["totals"]["paid"], "Written off": data["totals"]["written_off"],
                        "Closing balance": data["closing"], **{f"Aging {k}": v for k, v in data["aging"].items()}}
    path = await _write(report, data["rows"], fmt)
    return path, f"statement-{data['party']['name'].replace(' ', '-').lower()}-{data['date_to']}.{fmt}", MEDIA[fmt]
