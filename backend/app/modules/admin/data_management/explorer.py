"""Reading a business's records for Data Management: counts, a filtered page, one record's details, and the exact set a selection means.

Every query starts from the selected business, in the query itself: nothing relies on the screen having filtered by business.
Dates are cut at midnight in the business's own time zone, and the date type (sale date, created, updated, posting) is always explicit.
"""
import uuid
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Date, String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.admin.data_management.registry import FILTER_LABELS, MODULES, ModuleSpec
from app.modules.tenants.models import Tenant

MAX_SELECTION = 5000
PAGE_MAX = 100
PRESETS = ("today", "yesterday", "last_7_days", "last_30_days", "this_month", "last_month", "custom", "all")
PRESET_LABEL = {"today": "Today", "yesterday": "Yesterday", "last_7_days": "Last 7 days", "last_30_days": "Last 30 days", "this_month": "This month", "last_month": "Last month",
                "custom": "Custom range", "all": "All dates"}


def spec_for(module: str) -> ModuleSpec:
    spec = MODULES.get(module)
    if spec is None:
        raise ValidationError("Unknown module")
    return spec


async def tenant_of(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise NotFoundError("Business not found")
    return tenant


def tz_of(tenant: Tenant) -> ZoneInfo:
    try:
        return ZoneInfo(tenant.timezone or "UTC")
    except Exception:  # noqa: BLE001 - a bad stored zone must not break the screen
        return ZoneInfo("UTC")


def resolve_range(filters: dict, tz: ZoneInfo, today: date | None = None) -> tuple[date | None, date | None]:
    """(first day, last day inclusive) in the business's time zone for a preset or a custom range. (None, None) means all dates."""
    today = today or datetime.now(tz).date()
    preset = filters.get("preset") or ("custom" if filters.get("from") or filters.get("to") else "all")
    if preset not in PRESETS:
        raise ValidationError("Unknown date range")
    if preset == "all":
        return None, None
    if preset == "today":
        return today, today
    if preset == "yesterday":
        return today - timedelta(days=1), today - timedelta(days=1)
    if preset == "last_7_days":
        return today - timedelta(days=6), today
    if preset == "last_30_days":
        return today - timedelta(days=29), today
    if preset == "this_month":
        return today.replace(day=1), today
    if preset == "last_month":
        end = today.replace(day=1) - timedelta(days=1)
        return end.replace(day=1), end
    start, end = filters.get("from"), filters.get("to")
    try:
        start_d = date.fromisoformat(start) if start else None
        end_d = date.fromisoformat(end) if end else None
    except ValueError as exc:
        raise ValidationError("Dates must look like 2026-11-05") from exc
    if start_d and end_d and start_d > end_d:
        raise ValidationError("The start date must not be after the end date")
    return start_d, end_d


def date_type_of(spec: ModuleSpec, filters: dict) -> str | None:
    wanted = filters.get("date_type")
    if wanted is None:
        return "transaction" if "transaction" in spec.dates else ("posting" if "posting" in spec.dates else "created" if "created" in spec.dates else None)
    if wanted not in spec.dates:
        raise ValidationError(f"{spec.label} has no '{wanted}' date")
    return wanted


def has_date_limit(spec: ModuleSpec, filters: dict, tz: ZoneInfo) -> bool:
    start, end = resolve_range(filters, tz)
    return start is not None or end is not None


def _ids(value) -> list[uuid.UUID]:
    out = []
    for item in value or []:
        try:
            out.append(uuid.UUID(str(item)))
        except ValueError as exc:
            raise ValidationError("A record id is not valid") from exc
    return out


def apply_filters(stmt, spec: ModuleSpec, filters: dict, tz: ZoneInfo):
    """Applies the filters this module supports. A filter the module does not have is rejected rather than silently ignored, so the screen can never show a filter that does nothing."""
    unknown = set(filters) - {"ids", "search", "date_type", "preset", "from", "to", "payment_status", "approval_status", "archived", *spec.filters}
    if unknown:
        raise ValidationError(f"{spec.label} cannot be filtered by {', '.join(sorted(unknown))}")
    if filters.get("ids"):
        stmt = stmt.where(spec.base.id.in_(_ids(filters["ids"])))
    for name, column in spec.filters.items():
        value = filters.get(name)
        if value in (None, "", []):
            continue
        if isinstance(value, list):
            stmt = stmt.where(cast(column, String).in_([str(v) for v in value]))
        elif name == "reference":
            stmt = stmt.where(column.ilike(f"%{value}%"))
        else:
            stmt = stmt.where(cast(column, String) == str(value))
    needle = (filters.get("search") or "").strip()
    if needle and spec.search:
        stmt = stmt.where(or_(*[cast(col, String).ilike(f"%{needle}%") for col in spec.search]))
    start, end = resolve_range(filters, tz)
    kind = date_type_of(spec, filters)
    if (start or end) and kind:
        column = spec.dates[kind][0]
        if isinstance(column.type, Date):
            if start:
                stmt = stmt.where(column >= start)
            if end:
                stmt = stmt.where(column <= end)
        else:
            if start:
                stmt = stmt.where(column >= datetime.combine(start, time.min, tz).astimezone(UTC))
            if end:
                stmt = stmt.where(column < datetime.combine(end + timedelta(days=1), time.min, tz).astimezone(UTC))
    if spec.key == "sales":
        stmt = _sales_filters(stmt, filters)
    return stmt


def _sales_filters(stmt, filters: dict):
    from app.modules.sales.models.order import Order
    paid = filters.get("payment_status")
    if paid == "Unpaid":
        stmt = stmt.where(Order.amount_paid <= 0)
    elif paid == "PartiallyPaid":
        stmt = stmt.where(Order.amount_paid > 0, Order.amount_paid < Order.total)
    elif paid == "Paid":
        stmt = stmt.where(Order.amount_paid >= Order.total)
    approval = filters.get("approval_status")
    if approval == "awaiting":
        stmt = stmt.where(Order.status == "Awaiting Approval")
    elif approval == "approved":
        stmt = stmt.where(Order.approved_by.is_not(None), Order.status != "Rejected")
    elif approval == "rejected":
        stmt = stmt.where(Order.status == "Rejected")
    elif approval == "not_required":
        stmt = stmt.where(Order.approved_by.is_(None), Order.status.notin_(["Awaiting Approval", "Rejected"]))
    shown = filters.get("archived")
    if shown == "active":
        stmt = stmt.where(Order.archived_at.is_(None))
    elif shown == "archived":
        stmt = stmt.where(Order.archived_at.is_not(None))
    return stmt


def _plain(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _row(spec: ModuleSpec, mapping: dict) -> dict:
    row = {k: _plain(v) for k, v in mapping.items()}
    if spec.key == "sales":
        total, paid = float(mapping.get("amount") or 0), float(mapping.get("paid") or 0)
        row["payment_status"] = "Paid" if paid >= total > 0 else "Unpaid" if paid <= 0 else "Partly paid"
        row["approval_status"] = ("Awaiting approval" if mapping.get("status") == "Awaiting Approval" else "Rejected" if mapping.get("status") == "Rejected"
                                  else "Approved" if mapping.get("approved_by") else "Not required")
        row["archived"] = mapping.get("archived_at") is not None
    row["label"] = str(row.get(spec.label_of) or row["id"])
    return row


async def module_counts(db: AsyncSession, tenant_id: uuid.UUID) -> list[dict]:
    out = []
    for spec in MODULES.values():
        total = (await db.execute(select(func.count()).select_from(spec.query(tenant_id).subquery()))).scalar_one()
        supported = [op for op, cap in spec.ops.items() if cap.supported]
        out.append({"key": spec.key, "label": spec.label, "group": spec.group, "noun": spec.noun, "count": total, "operations": supported})
    return out


def describe(spec: ModuleSpec) -> dict:
    return {
        "key": spec.key, "label": spec.label, "noun": spec.noun, "note": spec.note,
        "columns": [{"key": c.key, "label": c.label, "align": c.align, "kind": c.kind} for c in spec.columns],
        "date_types": [{"key": k, "label": v[1]} for k, v in spec.dates.items()],
        "default_date_type": date_type_of(spec, {}),
        "filters": [{"key": k, "label": FILTER_LABELS.get(k, k)} for k in spec.filters] + ([{"key": "payment_status", "label": "Payment status"}, {"key": "approval_status", "label": "Approval status"}] if spec.key == "sales" else []),
        "sorts": list(spec.sorts), "default_sort": spec.default_sort,
        "operations": {op: {"supported": cap.supported, "why": cap.why} for op, cap in spec.ops.items()},
        "presets": [{"key": k, "label": PRESET_LABEL[k]} for k in PRESETS],
    }


async def list_records(db: AsyncSession, tenant: Tenant, module: str, filters: dict, *, page: int, page_size: int, sort: str | None, descending: bool) -> dict:
    spec = spec_for(module)
    tz = tz_of(tenant)
    page_size = max(1, min(page_size, PAGE_MAX))
    stmt = apply_filters(spec.query(tenant.id), spec, filters, tz)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    key = sort or spec.default_sort
    column = spec.sorts.get(key)
    if column is None:
        raise ValidationError("You cannot sort by that column")
    order = column.desc() if descending else column.asc()
    rows = (await db.execute(stmt.order_by(order, spec.base.id).offset((max(page, 1) - 1) * page_size).limit(page_size))).mappings().all()
    return {"items": [_row(spec, dict(r)) for r in rows], "total": total, "page": page, "page_size": page_size, "timezone": str(tz), "date_type": date_type_of(spec, filters),
            "range": [d.isoformat() if d else None for d in resolve_range(filters, tz)]}


async def resolve_selection(db: AsyncSession, tenant: Tenant, module: str, selection: dict) -> tuple[list[uuid.UUID], dict]:
    """The exact record ids a selection means. 'ids' is the people-picked set; 'matching' is every record that matches the filters, less the ones taken out.
    The set is fixed here: later changes to the data never add records to an operation that was already previewed."""
    spec = spec_for(module)
    mode = selection.get("mode")
    if mode == "ids":
        ids = _ids(selection.get("ids"))
    elif mode == "matching":
        filters = selection.get("filters") or {}
        stmt = apply_filters(spec.query(tenant.id), spec, filters, tz_of(tenant))
        found = (await db.execute(select(spec.base.id).where(spec.base.id.in_(select(stmt.subquery().c.id))).limit(MAX_SELECTION + 1))).scalars().all()
        if len(found) > MAX_SELECTION:
            raise ValidationError(f"More than {MAX_SELECTION:,} records match. Narrow the filters so the exact set can be previewed.")
        excluded = set(_ids(selection.get("excluded_ids")))
        ids = [i for i in found if i not in excluded]
    else:
        raise ValidationError("Choose records first")
    ids = list(dict.fromkeys(ids))
    if not ids:
        raise ValidationError("No records were selected")
    if len(ids) > MAX_SELECTION:
        raise ValidationError(f"Select at most {MAX_SELECTION:,} records at a time")
    # keep only records that belong to this business: an id from another business is simply not found, never touched
    owned = set((await db.execute(select(spec.base.id).where(spec.base.id.in_(ids), spec.base.tenant_id == tenant.id))).scalars()) if hasattr(spec.base, "tenant_id") else set(ids)
    missing = [i for i in ids if i not in owned]
    if not owned:
        raise ValidationError("None of the selected records belong to this business")
    return [i for i in ids if i in owned], {"missing": [str(i) for i in missing]}


async def record_detail(db: AsyncSession, tenant: Tenant, module: str, record_id: uuid.UUID) -> dict:
    """One record as the business sees it, plus everything that points at it and which operations are available for it. Another business's id is simply not found."""
    from app.modules.admin.data_management.operations import human, reference_counts
    spec = spec_for(module)
    row = (await db.execute(spec.query(tenant.id).where(spec.base.id == record_id))).mappings().first()
    if row is None:
        raise NotFoundError("Record not found")
    plain = _row(spec, dict(row))
    refs = (await reference_counts(db, spec.base, [record_id])).get(record_id, {})
    return {
        "id": str(record_id), "module": module, "label": plain["label"], "fields": [{"key": c.key, "label": c.label or "Picture", "kind": c.kind, "value": plain.get(c.key)} for c in spec.columns],
        "related": {human(t): n for t, n in sorted(refs.items())}, "operations": {op: {"supported": cap.supported, "why": cap.why} for op, cap in spec.ops.items()},
    }


async def filter_options(db: AsyncSession, tenant: Tenant, module: str) -> dict:
    """The values each filter of a module can take, for this business only, so the screen offers a picker instead of asking for ids."""
    from app.modules.inventory.models.supplier import Supplier as StockSupplier
    from app.modules.inventory.models.warehouse import Warehouse
    from app.modules.sales.models.customer import Customer
    from app.modules.tenants.models import Branch, User
    spec = spec_for(module)
    t = tenant.id
    out: dict[str, list] = {}
    for name, column in spec.filters.items():
        if name == "status":
            out[name] = [{"id": v, "name": v} for v in (await db.execute(select(column).where(spec.base.tenant_id == t).distinct().order_by(column).limit(50))).scalars() if v]
        elif name == "branch_id":
            out[name] = [{"id": str(i), "name": n} for i, n in (await db.execute(select(Branch.id, Branch.name).where(Branch.tenant_id == t).order_by(Branch.name))).all()]
        elif name in ("created_by", "salesperson_id"):
            out[name] = [{"id": str(i), "name": n} for i, n in (await db.execute(select(User.id, User.full_name).where(User.tenant_id == t).order_by(User.full_name).limit(300))).all()]
        elif name == "warehouse_id":
            out[name] = [{"id": str(i), "name": n} for i, n in (await db.execute(select(Warehouse.id, Warehouse.name).where(Warehouse.tenant_id == t).order_by(Warehouse.name))).all()]
        elif name == "customer_id":
            out[name] = [{"id": str(i), "name": n} for i, n in (await db.execute(select(Customer.id, Customer.name).where(Customer.tenant_id == t).order_by(Customer.name).limit(300))).all()]
        elif name == "supplier_id":
            out[name] = [{"id": str(i), "name": n} for i, n in (await db.execute(select(StockSupplier.id, StockSupplier.name).where(StockSupplier.tenant_id == t).order_by(StockSupplier.name).limit(300))).all()]
    return out
