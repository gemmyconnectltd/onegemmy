"""What each operation may do to each module, and how it is done.

Two halves for every module and operation: an assessment (read-only: which records are eligible, which are blocked and why, what else
would be touched) and an executor (does one record through the module's own service, so its rules, audit and ledger entries still apply).
The assessment is run again, from scratch, right before execution; nothing is trusted from the preview.
"""
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base
from app.core.exceptions import ValidationError
from app.modules.admin.data_management.explorer import _plain, _row, spec_for
from app.modules.audit.service import record_audit
from app.modules.tenants.models import Tenant, User

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass
class Assessment:
    id: uuid.UUID
    label: str
    eligible: bool = False
    reasons: list[str] = field(default_factory=list)  # why not (blocked) or a note (eligible)
    related: dict[str, int] = field(default_factory=dict)  # other records that go with it or depend on it
    alternative: str | None = None  # the supported way to do what was asked when it is blocked
    changes: list[dict] = field(default_factory=list)  # correction: field, before, after
    notes: list[str] = field(default_factory=list)  # what an eligible record keeps or loses, in plain words

    def dump(self) -> dict:
        return {"id": str(self.id), "label": self.label, "eligible": self.eligible, "reasons": self.reasons, "related": self.related, "alternative": self.alternative, "changes": self.changes, "notes": self.notes}


_NAMES = {
    "accounting_transactions": "journal entries", "accounting_transaction_lines": "journal lines", "sales_order_payments": "payments", "sales_order_items": "sale lines", "sales_orders": "sales",
    "sales_returns": "returns", "sales_deals": "deals", "sales_quotations": "quotations", "sales_quotation_items": "quotation lines", "sales_customers": "customers",
    "purchase_items": "purchase lines", "purchase_orders": "purchases", "purchase_returns": "purchase returns", "inventory_stock_transfer_items": "transfer lines",
    "inventory_stock_movements": "stock movements", "inventory_stock_count_lines": "stock count lines", "inventory_products": "products", "inventory_product_variants": "variants",
    "inventory_product_images": "extra pictures", "inventory_batches": "batches", "inventory_serials": "serial numbers", "accounting_manual_debts": "debts", "accounting_expenses": "expenses",
    "crm_activities": "CRM activities", "tax_calculations": "tax records", "accounting_tax_calculations": "tax records",
}


def human(table: str) -> str:
    """A table's name in words the person recognises."""
    return _NAMES.get(table, table.replace("_", " "))


# ── The dependency engine ────────────────────────────────────────────────────

def _edges(base):
    target = base.__table__
    for table in Base.metadata.tables.values():
        for fk in table.foreign_keys:
            if fk.column.table is target and fk.column.name == "id":
                yield table.name, fk.parent, (fk.ondelete or "NO ACTION").upper()


async def reference_counts(db: AsyncSession, base, ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
    """{record id: {table: how many rows in that table point at it}}, found from the database's own foreign keys, so no dependency can be forgotten."""
    out: dict[uuid.UUID, dict[str, int]] = {i: {} for i in ids}
    for table, column, _ in _edges(base):
        for rid, count in (await db.execute(select(column, func.count()).where(column.in_(ids)).group_by(column))).all():
            out[rid][table] = out[rid].get(table, 0) + count
    return out


async def rows_for(db: AsyncSession, tenant_id: uuid.UUID, module: str, ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    spec = spec_for(module)
    found = (await db.execute(spec.query(tenant_id).where(spec.base.id.in_(ids)))).mappings().all()
    return {r["id"]: {**dict(r), "_plain": _row(spec, dict(r))} for r in found}


async def locked_through(db: AsyncSession, tenant_id: uuid.UUID) -> date | None:
    from app.modules.accounting.models.workspace import AccountingPreference
    row = await db.get(AccountingPreference, tenant_id)
    return row.locked_through if row else None


def _block_on_references(a: Assessment, refs: dict[str, int], owned: set[str]) -> None:
    for table, count in sorted(refs.items()):
        if table in owned:
            a.related[human(table)] = count
        else:
            a.reasons.append(f"Used by {count} {human(table)}")


# ── Assessments ──────────────────────────────────────────────────────────────

async def assess(db: AsyncSession, tenant: Tenant, module: str, op: str, ids: list[uuid.UUID], payload: dict) -> list[Assessment]:
    spec = spec_for(module)
    cap = spec.cap(op)
    rows = await rows_for(db, tenant.id, module, ids)
    out: list[Assessment] = []
    if not cap.supported:
        return [Assessment(i, str(rows.get(i, {}).get("_plain", {}).get("label", i)), False, [cap.why]) for i in ids]
    handler = _ASSESS.get((module, "delete" if op == "clean_test" else op))
    for rid in ids:
        row = rows.get(rid)
        if row is None:
            out.append(Assessment(rid, str(rid), False, ["This record no longer exists"]))
            continue
        out.append(Assessment(rid, row["_plain"]["label"]))
    if handler is None:
        for a in out:
            if not a.reasons:
                a.reasons.append("Not available for this module.")
        return out
    await handler(db, tenant, rows, [a for a in out if not a.reasons], payload)
    for a in out:
        a.eligible = not a.reasons
    return out


async def _delete_sales(db, tenant, rows, items, payload):
    from app.modules.sales.models.order import Order
    refs = await reference_counts(db, Order, [a.id for a in items])
    for a in items:
        r = rows[a.id]
        if r["status"] not in ("Pending", "Awaiting Approval", "Rejected"):
            a.reasons.append(f"The sale is {r['status']}: it has been paid or posted to the books")
            a.alternative = "Void it (reverses the books entries and returns the stock) or archive it. Both keep the history."
        if float(r["paid"] or 0) > 0:
            a.reasons.append("Money was received against it")
        _block_on_references(a, refs[a.id], {"sales_order_items"})
        if a.reasons and not a.alternative:
            a.alternative = "Archive it instead: it leaves the active lists and keeps its history."


async def _delete_customers(db, tenant, rows, items, payload):
    from app.modules.sales.models.customer import Customer
    refs = await reference_counts(db, Customer, [a.id for a in items])
    for a in items:
        _block_on_references(a, refs[a.id], set())
        if a.reasons:
            a.alternative = "Archive the customer: their invoices, payments and debts stay exactly as they are."


async def _delete_products(db, tenant, rows, items, payload):
    from app.modules.inventory.models.product import Product
    refs = await reference_counts(db, Product, [a.id for a in items])
    extra = {r[0]: r for r in (await db.execute(select(Product.id, Product.stock, Product.has_variants).where(Product.id.in_([a.id for a in items])))).all()}
    for a in items:
        _, stock, variants = extra[a.id]
        if float(stock or 0) != 0:
            a.reasons.append(f"{float(stock):g} units are in stock: adjust the stock to zero with a stock count first")
        if variants:
            a.reasons.append("It has variants: archive it, or remove the variants first")
        _block_on_references(a, refs[a.id], {"inventory_product_images"})
        if a.reasons:
            a.alternative = "Archive the product: it stops being sold and keeps its name in past sales and purchases."


async def _delete_purchases(db, tenant, rows, items, payload):
    from app.modules.procurement.models.purchase_order import PurchaseOrder
    refs = await reference_counts(db, PurchaseOrder, [a.id for a in items])
    for a in items:
        if rows[a.id]["status"] != "Draft":
            a.reasons.append(f"The purchase is {rows[a.id]['status']}: only drafts can be deleted")
            a.alternative = "Cancel it in Purchases, or record a supplier return if goods were received."
        _block_on_references(a, refs[a.id], {"purchase_items"})


async def _delete_expenses(db, tenant, rows, items, payload):
    from app.modules.accounting.models.expense import Expense
    refs = await reference_counts(db, Expense, [a.id for a in items])
    extra = {r[0]: r for r in (await db.execute(select(Expense.id, Expense.reversal_transaction_id, Expense.refunded_amount).where(Expense.id.in_([a.id for a in items])))).all()}
    for a in items:
        r = rows[a.id]
        if r["status"] not in ("Pending", "Rejected"):
            a.reasons.append(f"The expense is {r['status']}: it has been approved and posted to the books")
            a.alternative = "Reverse it in Expenses, which keeps the books and the audit trail."
        if r["paid_at"] is not None or float(extra[a.id][2] or 0) > 0:
            a.reasons.append("Money was paid or refunded against it")
        if extra[a.id][1] is not None:
            a.reasons.append("It was reversed and its reversal entry is part of the books")
        _block_on_references(a, refs[a.id], set())


async def _archive_sales(db, tenant, rows, items, payload):
    for a in items:
        r = rows[a.id]
        if r["archived_at"] is not None:
            a.reasons.append("Already archived")
        elif r["status"] == "Awaiting Approval":
            a.reasons.append("It is waiting for an approval decision: decide it first")
        else:
            a.notes.append("Its payments and books entries stay exactly as they are")


async def _archive_flag(db, tenant, rows, items, payload, noun: str):
    for a in items:
        if not rows[a.id]["active"]:
            a.reasons.append(f"The {noun} is already inactive")


async def _archive_users(db, tenant, rows, items, payload):
    for a in items:
        r = rows[a.id]
        if not r["active"]:
            a.reasons.append("The user is already inactive")
            continue
        if (r["role"] or "").lower() == "owner":
            others = (await db.execute(select(func.count()).select_from(User).where(User.tenant_id == tenant.id, User.role == "owner", User.is_active.is_(True), User.id != a.id))).scalar_one()
            if others == 0:
                a.reasons.append("This is the last active owner of the business")
                a.alternative = "Make someone else an owner first."


async def _archive_warehouses(db, tenant, rows, items, payload):
    from app.modules.inventory.models.transfer import StockTransfer
    from app.modules.inventory.models.warehouse import StockCount, Warehouse
    from app.modules.inventory.service.stock_ledger import balances
    held = await balances(db, tenant.id)
    for a in items:
        w = await db.get(Warehouse, a.id)
        if not w.is_active:
            a.reasons.append("The warehouse is already inactive")
            continue
        if w.is_default:
            a.reasons.append("It is the default warehouse: make another warehouse the default first")
        units = sum((q for (wh, _, _), q in held.items() if wh == a.id), 0)
        if units != 0:
            a.reasons.append(f"It still holds {float(units):g} units: transfer them out first")
        if (await db.execute(select(StockTransfer.id).where(StockTransfer.tenant_id == tenant.id, StockTransfer.status.in_(["pending", "in_transit"]),
                                                            (StockTransfer.from_warehouse_id == a.id) | (StockTransfer.to_warehouse_id == a.id)).limit(1))).first():
            a.reasons.append("It has transfers that are not finished")
        if (await db.execute(select(StockCount.id).where(StockCount.tenant_id == tenant.id, StockCount.warehouse_id == a.id, StockCount.status == "Submitted").limit(1))).first():
            a.reasons.append("It has a stock count waiting for a decision")


def _single(items: list[Assessment]) -> bool:
    if len(items) != 1:
        for a in items:
            a.reasons.append("Corrections are made one record at a time")
        return False
    return True


def _diff(before: dict, fields: dict, allowed: set[str]) -> tuple[list[dict], str | None]:
    unknown = set(fields) - allowed
    if unknown:
        return [], f"These fields cannot be corrected here: {', '.join(sorted(unknown))}"
    changes = [{"field": k, "before": before.get(k), "after": v} for k, v in fields.items() if (before.get(k) or "") != (v if v is not None else "")]
    return changes, None if changes else "Nothing would change"


async def _correct_customers(db, tenant, rows, items, payload):
    from app.modules.sales.models.customer import Customer
    if not _single(items):
        return
    a = items[0]
    obj = await db.get(Customer, a.id)
    fields = {k: (v.strip() if isinstance(v, str) else v) for k, v in (payload.get("fields") or {}).items()}
    changes, problem = _diff({k: getattr(obj, k) for k in ("name", "email", "phone", "address", "tin")}, fields, {"name", "email", "phone", "address", "tin"})
    if problem:
        a.reasons.append(problem)
    if fields.get("name") == "":
        a.reasons.append("A customer needs a name")
    if fields.get("email") and not EMAIL.match(fields["email"]):
        a.reasons.append("The email address is not valid")
    a.changes = changes
    a.alternative = "To merge duplicate customers, archive the duplicate: merging is not supported here."


async def _correct_products(db, tenant, rows, items, payload):
    from app.modules.inventory.models.product import Product
    if not _single(items):
        return
    a = items[0]
    obj = await db.get(Product, a.id)
    fields = dict(payload.get("fields") or {})
    allowed = {"name", "description", "barcode", "subcategory", "min_stock"}
    changes, problem = _diff({k: (float(getattr(obj, k)) if k == "min_stock" else getattr(obj, k)) for k in allowed}, fields, allowed)
    if problem:
        a.reasons.append(problem)
    if "min_stock" in fields and (fields["min_stock"] is None or float(fields["min_stock"]) < 0):
        a.reasons.append("The minimum stock cannot be negative")
    if fields.get("name") == "":
        a.reasons.append("A product needs a name")
    a.changes = changes
    a.alternative = "Prices change through Approvals, and quantities through stock counts, so their history stays complete."


async def _correct_warehouses(db, tenant, rows, items, payload):
    from app.modules.inventory.models.warehouse import Warehouse
    if not _single(items):
        return
    a = items[0]
    obj = await db.get(Warehouse, a.id)
    fields = dict(payload.get("fields") or {})
    changes, problem = _diff({k: getattr(obj, k) for k in ("name", "address", "description")}, fields, {"name", "address", "description"})
    if problem:
        a.reasons.append(problem)
    if fields.get("name") == "":
        a.reasons.append("A warehouse needs a name")
    a.changes = changes


async def _correct_sales(db, tenant, rows, items, payload):
    from app.modules.sales.models.order import Order
    if not _single(items):
        return
    a = items[0]
    r = rows[a.id]
    action = payload.get("action")
    obj = await db.get(Order, a.id)
    if action == "notes":
        a.changes, problem = _diff({"notes": obj.notes}, {"notes": (payload.get("notes") or "").strip() or None}, {"notes"})
        if problem:
            a.reasons.append(problem)
    elif action == "salesperson":
        target = (await db.execute(select(User).where(User.id == uuid.UUID(str(payload.get("salesperson_id"))), User.tenant_id == tenant.id, User.is_active.is_(True)))).scalar_one_or_none() if payload.get("salesperson_id") else None
        if target is None:
            a.reasons.append("Choose an active member of this business")
        elif target.id == obj.salesperson_id:
            a.reasons.append("Nothing would change")
        else:
            a.changes = [{"field": "salesperson", "before": r["salesperson"], "after": target.full_name}]
    elif action == "void":
        if r["status"] != "Completed":
            a.reasons.append(f"Only a completed sale can be voided (this one is {r['status']})")
        lock = await locked_through(db, tenant.id)
        if lock and r["date"].date() <= lock:
            a.reasons.append(f"The books are closed through {lock}: reopen the period first")
        a.changes = [{"field": "status", "before": r["status"], "after": "Cancelled"}]
        a.notes.append("Its books entries and payments are reversed and its stock goes back on the shelf; nothing is deleted")
    else:
        a.reasons.append("Choose what to correct: salesperson, notes, or void the sale")
    a.alternative = "A sale's items and prices are corrected by the business owner with the sale's own Correct flow, which reverses and re-posts the books."


_ASSESS = {
    ("sales", "delete"): _delete_sales, ("customers", "delete"): _delete_customers, ("products", "delete"): _delete_products,
    ("purchases", "delete"): _delete_purchases, ("expenses", "delete"): _delete_expenses,
    ("sales", "archive"): _archive_sales,
    ("customers", "archive"): lambda *a: _archive_flag(*a, noun="customer"), ("products", "archive"): lambda *a: _archive_flag(*a, noun="product"),
    ("users", "archive"): _archive_users, ("warehouses", "archive"): _archive_warehouses,
    ("customers", "correct"): _correct_customers, ("products", "correct"): _correct_products, ("warehouses", "correct"): _correct_warehouses, ("sales", "correct"): _correct_sales,
}


# ── Executors: one record, through the module's own service ──────────────────

def _who(admin: User) -> str:
    return f"{admin.full_name or admin.email} (platform)"


async def _audit(db, tenant_id, admin, module, record_id, label, action, ref, reason, changes=None):
    await record_audit(db, tenant_id=tenant_id, actor_user_id=admin.id, actor_name=_who(admin), action=f"data.{action}", entity_type=module, entity_id=str(record_id),
                       summary=f"{action.replace('_', ' ').capitalize()} {label} (data operation {ref})", changes={"operation": ref, "reason": reason, **(changes or {})})


async def run_one(db: AsyncSession, tenant: Tenant, admin: User, module: str, op: str, rid: uuid.UUID, payload: dict, reason: str, ref: str) -> str:
    """Does one record. Raises with a plain message when it cannot; the caller records that as this record's failure and carries on with the rest."""
    kind = "delete" if op == "clean_test" else op
    t = tenant.id
    if (module, kind) == ("sales", "archive"):
        from app.modules.sales.service.order import archive_order
        await archive_order(db, t, rid, admin.id, _who(admin), f"{reason} (data operation {ref})")
        return "Archived; payments and books entries untouched"
    if (module, kind) == ("sales", "delete"):
        from app.modules.sales.service.order import delete_order
        await delete_order(db, t, rid, admin.id, _who(admin))
        return "Deleted"
    if (module, kind) == ("sales", "correct"):
        from app.modules.sales.schemas.order import OrderUpdate
        from app.modules.sales.service.order import change_salesperson, update_order, void_order
        action = payload.get("action")
        if action == "notes":
            await update_order(db, t, rid, OrderUpdate(notes=(payload.get("notes") or "").strip() or None), user_id=admin.id, user_name=_who(admin))
        elif action == "salesperson":
            await change_salesperson(db, t, rid, uuid.UUID(str(payload["salesperson_id"])), f"{reason} (data operation {ref})", admin.id, _who(admin))
        elif action == "void":
            await void_order(db, t, rid, admin.id, _who(admin), f"{reason} (data operation {ref})")
        else:
            raise ValidationError("Unknown correction")
        return f"Corrected ({action})"
    if module == "customers":
        from app.modules.sales.models.customer import Customer
        obj = await db.get(Customer, rid)
        if kind == "archive":
            obj.is_active = False
            await _audit(db, t, admin, module, rid, obj.name, "archive", ref, reason)
            await db.commit()
            return "Archived: inactive, history kept"
        if kind == "delete":
            label = obj.name
            await _audit(db, t, admin, module, rid, label, "delete", ref, reason)
            await db.delete(obj)
            await db.commit()
            return "Deleted"
        if kind == "correct":
            before = {k: getattr(obj, k) for k in payload["fields"]}
            for k, v in payload["fields"].items():
                setattr(obj, k, v.strip() if isinstance(v, str) else v)
            await _audit(db, t, admin, module, rid, obj.name, "correct", ref, reason, {"before": before, "after": payload["fields"]})
            await db.commit()
            return "Corrected"
    if module == "products":
        from app.modules.inventory.models.product import Product
        obj = await db.get(Product, rid)
        if kind == "archive":
            obj.is_active = False
            await _audit(db, t, admin, module, rid, obj.name, "archive", ref, reason)
            await db.commit()
            return "Archived: no longer sold, history kept"
        if kind == "delete":
            from app.modules.inventory.service.product import delete_product
            await _audit(db, t, admin, module, rid, obj.name, "delete", ref, reason)
            await delete_product(db, t, rid)
            return "Deleted"
        if kind == "correct":
            before = {k: getattr(obj, k) for k in payload["fields"]}
            for k, v in payload["fields"].items():
                setattr(obj, k, v)
            await _audit(db, t, admin, module, rid, obj.name, "correct", ref, reason, {"before": {k: _plain(v) for k, v in before.items()}, "after": payload["fields"]})
            await db.commit()
            return "Corrected"
    if (module, kind) == ("purchases", "delete"):
        from app.modules.procurement.service.purchase import delete_purchase
        await _audit(db, t, admin, module, rid, str(rid), "delete", ref, reason)
        await delete_purchase(db, t, rid)
        return "Deleted"
    if (module, kind) == ("expenses", "delete"):
        from app.modules.accounting.models.expense import Expense
        obj = await db.get(Expense, rid)
        await _audit(db, t, admin, module, rid, obj.reference, "delete", ref, reason)
        await db.delete(obj)
        await db.commit()
        return "Deleted"
    if module == "warehouses":
        from app.modules.inventory.service.warehouse import set_active, update_warehouse
        if kind == "archive":
            await set_active(db, t, admin, rid, False)
            return "Deactivated: stock history kept"
        if kind == "correct":
            await update_warehouse(db, t, admin, rid, payload["fields"])
            return "Corrected"
    if (module, kind) == ("users", "archive"):
        obj = await db.get(User, rid)
        obj.is_active = False
        await _audit(db, t, admin, module, rid, obj.full_name, "archive", ref, reason)
        await db.commit()
        return "Deactivated: can no longer sign in, history kept"
    raise ValidationError("This operation is not available for this module")


def now() -> datetime:
    return datetime.now(UTC)
