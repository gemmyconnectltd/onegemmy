"""Reset Business Data: wipe a business's transactional data, keeping the groups the administrator chooses.

The engine is metadata-driven. Every group names the tables it owns; the rows of a table are found by the business's tenant id (or, for line tables
with no tenant column, through their parent row), and the order of deletion comes from the foreign keys, children first. Nothing is deleted
that a group does not own: users, branches, settings, billing, the audit log and the data-operation history are never touched.

A reset is planned first (counts per group and anything that would be left pointing at a deleted record), copied to a stored export, and only then deleted.
"""
import csv
import hashlib
import io
import json
import uuid
import zipfile
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import Base
from app.core.exceptions import ValidationError
from app.modules.admin.data_management.explorer import tz_of
from app.modules.tenants.models import Tenant

BATCH = 5000
SENSITIVE = {"hashed_password", "password", "mfa_secret", "totp_secret", "refresh_token", "api_key"}


@dataclass(frozen=True)
class Group:
    key: str
    label: str
    kind: str  # master (kept unless chosen otherwise) | transactional
    tables: tuple[str, ...]
    note: str = ""


GROUPS: tuple[Group, ...] = (
    Group("customers", "Customers", "master", ("sales_customers",)),
    Group("suppliers", "Suppliers", "master", ("inventory_suppliers",)),
    Group("products", "Products & inventory items", "master", ("inventory_products", "inventory_product_variants", "inventory_product_images")),
    Group("categories", "Product categories, brands & units", "master", ("inventory_categories", "inventory_brands", "inventory_units")),
    Group("expense_categories", "Expense categories", "master", ("accounting_expense_categories",)),
    Group("chart_of_accounts", "Chart of accounts", "master", ("accounting_accounts",), "Accounting cannot post without accounts: the business must set them up again if they are deleted."),
    Group("warehouses", "Warehouses", "master", ("inventory_warehouses",)),
    Group("sales", "Sales & POS (orders, lines, payments, returns, quotations)", "transactional",
          ("sales_orders", "sales_order_items", "sales_order_payments", "sales_returns", "sales_return_items", "sales_quotations", "sales_quotation_items")),
    Group("purchases", "Purchases", "transactional",
          ("purchase_orders", "purchase_items", "purchase_returns", "purchase_requisitions", "procurement_goods_receipts", "procurement_goods_receipt_lines",
           "procurement_supplier_bills", "procurement_supplier_payments", "procurement_purchase_attachments")),
    Group("expenses", "Expenses", "transactional", ("accounting_expenses", "accounting_recurring_expenses")),
    Group("accounting", "Accounting (journal entries, transactions, reports cache)", "transactional",
          ("accounting_transactions", "accounting_transaction_lines", "accounting_report_snapshots", "accounting_report_rows", "accounting_bank_reconciliations",
           "accounting_tax_calculations", "accounting_tax_payments")),
    Group("stock", "Stock movements, adjustments & transfers", "transactional",
          ("inventory_stock_movements", "inventory_stock_counts", "inventory_stock_count_lines", "inventory_stock_transfers", "inventory_stock_transfer_items",
           "inventory_batches", "inventory_product_serials")),
    Group("debt", "Debt management", "transactional", ("accounting_manual_debts", "accounting_manual_debt_payments", "accounting_debt_adjustments")),
    Group("manufacturing", "Manufacturing", "transactional", ("manufacturing_boms", "manufacturing_bom_items", "manufacturing_production_orders", "manufacturing_production_items")),
    Group("hr", "HR", "transactional", ("hr_applicants", "hr_attendance", "hr_employees", "hr_leave_requests", "hr_payroll_entries")),
    Group("services", "Services & appointments", "transactional", ("appointments", "queue_entries")),
    Group("repairs", "Repairs & warranty claims", "transactional", ("repair_jobs", "repair_job_parts", "inventory_warranty_claims")),
    Group("crm", "CRM activities, campaigns & deals", "transactional", ("crm_activities", "crm_campaigns", "crm_email_logs", "sales_deals")),
)
BY_KEY = {g.key: g for g in GROUPS}
# Counters that restart at 0001 when "Reset document numbering" is on. Order, expense, payment and transaction numbers are worked out from the
# documents that exist, so they restart on their own once those documents are gone.
NUMBERING_TABLES = ("accounting_journal_sequences",)
ALWAYS_KEPT = (
    {"key": "users", "label": "Users & access"}, {"key": "branches", "label": "Branches"},
    {"key": "settings", "label": "Settings, subscription & billing history"}, {"key": "audit", "label": "Audit log and Data Management history"},
)
PRESETS = {
    "customers_suppliers": {"label": "Keep customers & suppliers only", "keep": ["customers", "suppliers", "chart_of_accounts"]},
    "all_master": {"label": "Keep all master data (customers, suppliers, products, categories)",
                   "keep": ["customers", "suppliers", "products", "categories", "expense_categories", "chart_of_accounts", "warehouses"]},
    "full_wipe": {"label": "Full wipe (keep only users, branches, settings)", "keep": []},
}
DEFAULT_PRESET = "customers_suppliers"


@dataclass
class Config:
    keep: frozenset[str]
    reset_numbering: bool = True
    zero_stock: bool = True
    date_from: date | None = None
    date_to: date | None = None
    deleted: list[Group] = field(init=False)

    def __post_init__(self) -> None:
        self.deleted = [g for g in GROUPS if g.key not in self.keep]

    @property
    def ranged(self) -> bool:
        return self.date_from is not None or self.date_to is not None

    def dump(self) -> dict:
        return {"keep": sorted(self.keep), "reset_numbering": self.reset_numbering, "zero_stock": self.zero_stock,
                "date_from": self.date_from.isoformat() if self.date_from else None, "date_to": self.date_to.isoformat() if self.date_to else None}


def parse_config(payload: dict) -> Config:
    keep = payload.get("keep")
    if keep is None:
        keep = PRESETS[DEFAULT_PRESET]["keep"]
    unknown = [k for k in keep if k not in BY_KEY]
    if unknown:
        raise ValidationError(f"Unknown data group: {', '.join(map(str, unknown))}. Users, branches, settings and billing are always kept and are not listed.")

    def day(value, label):
        if value in (None, ""):
            return None
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise ValidationError(f"{label} is not a valid date") from exc

    start, end = day(payload.get("date_from"), "The start date"), day(payload.get("date_to"), "The end date")
    if start and end and start > end:
        raise ValidationError("The start date must not be after the end date")
    cfg = Config(keep=frozenset(keep), reset_numbering=bool(payload.get("reset_numbering", True)), zero_stock=bool(payload.get("zero_stock", True)), date_from=start, date_to=end)
    if not cfg.deleted:
        raise ValidationError("Everything is marked to keep, so there is nothing to delete")
    return cfg


def _tables() -> dict[str, sa.Table]:
    return Base.metadata.tables


def label_of(table: str) -> str:
    for g in GROUPS:
        if table in g.tables:
            return g.label.split(" (")[0]
    return table.replace("_", " ")


# A line that points at two parents in its group belongs to the document it is a line of.
HEADER_OF = {"sales_return_items": "sales_returns", "procurement_goods_receipt_lines": "procurement_goods_receipts"}


def _parent_fk(table: sa.Table, group_tables: set[str]) -> sa.ForeignKey | None:
    """The foreign key that ties a line table with no tenant column to its parent row in the same group."""
    candidates = [fk for fk in table.foreign_keys if fk.column.table.name in group_tables and fk.column.table.name != table.name]
    if table.name in HEADER_OF:
        candidates = [fk for fk in candidates if fk.column.table.name == HEADER_OF[table.name]]
    return candidates[0] if len(candidates) == 1 else None


def _created_range(table: sa.Table, tenant: Tenant, cfg: Config):
    if not cfg.ranged:
        return None
    tz = tz_of(tenant)
    clauses = []
    if cfg.date_from:
        clauses.append(table.c.created_at >= datetime.combine(cfg.date_from, datetime.min.time(), tz).astimezone(UTC))
    if cfg.date_to:
        clauses.append(table.c.created_at < datetime.combine(cfg.date_to + timedelta(days=1), datetime.min.time(), tz).astimezone(UTC))
    return sa.and_(*clauses)


class Scoper:
    """Builds the WHERE clause that finds one business's rows of a table, optionally inside a date range."""

    def __init__(self, tenant: Tenant, cfg: Config):
        self.tenant, self.cfg = tenant, cfg
        self._group_of = {t: g for g in GROUPS for t in g.tables}

    def everything(self, name: str):
        """All of the business's rows of a table, whatever the dates."""
        tb = _tables()[name]
        if "tenant_id" in tb.c:
            return tb.c.tenant_id == self.tenant.id
        group = {name2 for name2 in self._group_of if self._group_of[name2] is self._group_of.get(name)}
        fk = _parent_fk(tb, group)
        if fk is None:
            return None
        parent = fk.column.table
        inner = self.everything(parent.name)
        return None if inner is None else tb.c[fk.parent.name].in_(select(fk.column).where(inner))

    def to_delete(self, name: str):
        """The rows this reset deletes from a table; None when the table cannot be limited to the date range."""
        tb = _tables()[name]
        group = self._group_of.get(name)
        if group is None:
            return None
        if not self.cfg.ranged:
            return self.everything(name)
        group_tables = set(group.tables)
        if "tenant_id" in tb.c:
            if "created_at" not in tb.c:
                return None
            own = sa.and_(tb.c.tenant_id == self.tenant.id, _created_range(tb, self.tenant, self.cfg))
            clauses = [own]
            # a line created after its parent but belonging to a parent that is deleted goes with it
            for fk in tb.foreign_keys:
                parent = fk.column.table.name
                if parent in group_tables and parent != name:
                    inner = self.to_delete(parent)
                    if inner is not None:
                        clauses.append(tb.c[fk.parent.name].in_(select(fk.column).where(inner)))
            return sa.or_(*clauses)
        fk = _parent_fk(tb, group_tables)
        if fk is None:
            return None
        inner = self.to_delete(fk.column.table.name)
        return None if inner is None else tb.c[fk.parent.name].in_(select(fk.column).where(inner))


def validate_registry() -> list[str]:
    """Problems with the group definitions: a table that does not exist, or one whose rows cannot be tied to a business."""
    problems = []
    tables = _tables()
    seen: dict[str, str] = {}
    for g in GROUPS:
        for t in g.tables:
            if t not in tables:
                problems.append(f"{g.key}: no table {t}")
                continue
            if t in seen:
                problems.append(f"{t} is in both {seen[t]} and {g.key}")
            seen[t] = g.key
    probe = Tenant(id=uuid.uuid4(), name="probe", slug="probe")
    scoper = Scoper(probe, Config(keep=frozenset()))
    for t in seen:
        if scoper.everything(t) is None:
            problems.append(f"{t}: its rows cannot be tied to a business")
    return problems


def _count_sql(name: str, clause):
    tb = _tables()[name]
    return select(func.count()).select_from(tb).where(clause)


async def _referencing(db: AsyncSession, scoper: Scoper, deleted_tables: set[str]) -> list[dict]:
    """Rows that would be left pointing at a record this reset deletes: the foreign keys that point into a deleted table from rows that stay."""
    out: list[dict] = []
    for dname in sorted(deleted_tables):
        drop = scoper.to_delete(dname)
        if drop is None:
            continue
        dtb = _tables()[dname]
        for ktb in _tables().values():
            for fk in ktb.foreign_keys:
                if fk.column.table is not dtb or ktb.name == dname:
                    continue
                ids = select(fk.column).where(drop)
                clause = ktb.c[fk.parent.name].in_(ids)
                if ktb.name in deleted_tables:
                    own = scoper.to_delete(ktb.name)
                    if own is None:
                        continue
                    clause = sa.and_(clause, sa.not_(own))
                n = (await db.execute(_count_sql(ktb.name, clause))).scalar_one()
                if n:
                    out.append({"deleted": label_of(dname), "deleted_table": dname, "kept": label_of(ktb.name), "kept_table": ktb.name, "count": int(n), "nullable": ktb.c[fk.parent.name].nullable})
    return out


async def plan(db: AsyncSession, tenant: Tenant, cfg: Config) -> dict:
    """The dry run: per group, what is deleted and what stays, and what would block the reset. Changes nothing."""
    scoper = Scoper(tenant, cfg)
    groups, blockers, notes = [], [], []
    deleted_tables: set[str] = set()
    for g in GROUPS:
        kept_group = g.key in cfg.keep
        rows = []
        for t in g.tables:
            total = (await db.execute(_count_sql(t, scoper.everything(t)))).scalar_one()
            clause = None if kept_group else scoper.to_delete(t)
            doomed = 0 if clause is None else (await db.execute(_count_sql(t, clause))).scalar_one()
            if clause is not None:
                deleted_tables.add(t)
            elif not kept_group and cfg.ranged:
                notes.append(f"{t.replace('_', ' ')} has no created date, so it is left alone while a date range is set")
            rows.append({"table": t, "total": int(total), "delete": int(doomed), "kept": int(total - doomed)})
        groups.append({"key": g.key, "label": g.label, "kind": g.kind, "keep": kept_group, "delete": sum(r["delete"] for r in rows), "kept": sum(r["kept"] for r in rows), "tables": rows, "note": g.note})
    if cfg.reset_numbering and not cfg.ranged and "accounting" not in cfg.keep:
        notes.append("Journal numbering restarts at 0001. Order, expense, payment and transaction numbers restart on their own because no earlier documents remain.")
    elif cfg.reset_numbering and (cfg.ranged or "accounting" in cfg.keep):
        notes.append("Numbering is not reset: documents that remain keep their numbers, and new ones continue after the highest.")
    if "chart_of_accounts" not in cfg.keep:
        notes.append("The chart of accounts is deleted: the business must set up accounts again before it can post anything.")
    if "warehouses" not in cfg.keep:
        notes.append("Warehouses are deleted: the business must set one up again for per-warehouse stock.")
    if "products" in cfg.keep and "stock" not in cfg.keep and cfg.zero_stock:
        notes.append("Product stock is set to 0 because the stock history it came from is deleted.")
    for r in await _referencing(db, scoper, deleted_tables):
        what = f"{r['count']:,} kept {r['kept'].lower()} record{'s' if r['count'] != 1 else ''} still refer to {r['deleted'].lower()} that would be deleted"
        blockers.append({**r, "message": f"{what}. Keep {r['deleted'].lower()}, or delete {r['kept'].lower()} too."})
    return {"groups": groups, "always_kept": list(ALWAYS_KEPT), "blockers": blockers, "notes": notes, "config": cfg.dump(),
            "totals": {"delete": sum(g["delete"] for g in groups), "kept": sum(g["kept"] for g in groups)}}


async def group_counts(db: AsyncSession, tenant: Tenant) -> list[dict]:
    """Live record counts per group, for the checklist on the Configure step."""
    scoper = Scoper(tenant, Config(keep=frozenset()))
    out = []
    for g in GROUPS:
        n = 0
        for t in g.tables:
            n += (await db.execute(_count_sql(t, scoper.everything(t)))).scalar_one()
        out.append({"key": g.key, "label": g.label, "kind": g.kind, "count": int(n), "note": g.note})
    return out


def _order(tables: set[str]) -> list[str]:
    """Children before parents: a table is deleted only after every selected table that points at it."""
    refs = {t: {fk.column.table.name for fk in _tables()[t].foreign_keys if fk.column.table.name in tables and fk.column.table.name != t} for t in tables}
    pending, ordered = set(tables), []
    while pending:
        # a table can go once no pending table points at it
        ready = sorted(t for t in pending if not any(t in refs[o] for o in pending if o != t))
        if not ready:  # a cycle: take the rest in a stable order, the database decides
            ready = sorted(pending)
        ordered.extend(ready)
        pending -= set(ready)
    return ordered


def _storage_dir(tenant_id: uuid.UUID) -> Path:
    return Path(settings.UPLOAD_DIR).resolve() / "private" / "tenant-exports" / str(tenant_id)


async def export_all(db: AsyncSession, tenant: Tenant, cfg: Config, export_id: uuid.UUID) -> dict:
    """A complete copy of the data this reset touches, stored where it is never publicly served. Returns its location, size and checksum."""
    scoper = Scoper(tenant, cfg)
    folder = _storage_dir(tenant.id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{export_id}.zip"
    counts: dict[str, int] = {}
    try:
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
            for g in GROUPS:
                for t in g.tables:
                    tb = _tables()[t]
                    cols = [c for c in tb.c if c.name not in SENSITIVE]
                    n = 0
                    with zf.open(f"{g.key}/{t}.csv", "w") as raw:
                        text_out = io.TextIOWrapper(raw, encoding="utf-8", newline="")
                        writer = csv.writer(text_out)
                        writer.writerow([c.name for c in cols])
                        result = await db.stream(select(*cols).where(scoper.everything(t)))
                        async for part in result.partitions(BATCH):
                            for row in part:
                                writer.writerow(["" if v is None else (json.dumps(v, default=str) if isinstance(v, (dict, list)) else str(v)) for v in row])
                                n += 1
                        text_out.flush()
                        text_out.detach()
                    counts[t] = n
            zf.writestr("manifest.json", json.dumps({"business": tenant.name, "tenant_id": str(tenant.id), "created_at": datetime.now(UTC).isoformat(), "reset": cfg.dump(), "rows": counts}, indent=2))
        data = path.read_bytes()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {"path": str(path), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "rows": counts}


Progress = Callable[[dict], Awaitable[None]]


async def delete_data(db: AsyncSession, tenant: Tenant, cfg: Config, progress: Progress | None = None) -> dict:
    """Delete in dependency order, in batches, inside the caller's transaction (nothing is committed here). Returns the counts per group."""
    scoper = Scoper(tenant, cfg)
    tables = {t: scoper.to_delete(t) for g in cfg.deleted for t in g.tables}
    tables = {t: c for t, c in tables.items() if c is not None}
    if cfg.reset_numbering and not cfg.ranged and "accounting" not in cfg.keep:
        for t in NUMBERING_TABLES:
            tables[t] = _tables()[t].c.tenant_id == tenant.id
    group_of = {t: g.key for g in GROUPS for t in g.tables}
    totals: dict[str, int] = {}
    order = _order(set(tables))
    # the stock ledger refuses deletes; this lets one business's own rows go, for this transaction only
    await db.execute(text("SELECT set_config('app.allow_ledger_reset', :t, true)"), {"t": str(tenant.id)})
    try:
        for i, name in enumerate(order, 1):
            tb = _tables()[name]
            clause = tables[name]
            gone = 0
            pk = list(tb.primary_key.columns)
            whole = len(pk) != 1 or any(fk.column.table is tb for fk in tb.foreign_keys)  # a table that points at itself goes in one statement
            while True:
                if whole:
                    gone += (await db.execute(sa.delete(tb).where(clause))).rowcount or 0
                    break
                chunk = select(pk[0]).where(clause).limit(BATCH).correlate(None)
                n = (await db.execute(sa.delete(tb).where(pk[0].in_(chunk)))).rowcount or 0
                gone += n
                if n < BATCH:
                    break
            key = group_of.get(name, "accounting")
            totals[key] = totals.get(key, 0) + gone
            if progress:
                await progress({"stage": "delete", "table": name, "tables_done": i, "tables_total": len(order)})
        if cfg.zero_stock and "products" in cfg.keep and "stock" not in cfg.keep:
            await db.execute(text("UPDATE inventory_products SET stock = 0 WHERE tenant_id = :t"), {"t": tenant.id})
            await db.execute(text("UPDATE inventory_product_variants SET stock = 0 WHERE product_id IN (SELECT id FROM inventory_products WHERE tenant_id = :t)"), {"t": tenant.id})
        if progress:
            await progress({"stage": "recalculate"})
    finally:
        await db.execute(text("SELECT set_config('app.allow_ledger_reset', '', true)"))
    return totals

