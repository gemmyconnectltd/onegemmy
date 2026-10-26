"""Per-party debt statement. Built only from the debt projection and the payment / adjustment tables, so its closing
balance reconciles to the Receivables / Payables lists. Amounts are in the base currency (document rate)."""
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.accounting.models.debt import DebtAdjustment, ManualDebtPayment
from app.modules.accounting.repository.debt import DebtRepository
from app.modules.accounting.service.debt import context
from app.modules.accounting.service.workspace import encoded
from app.modules.procurement.models.supplier_bill import SupplierPayment
from app.modules.sales.models.order_payment import OrderPayment
from app.modules.tenants.models.user import User

CENT = Decimal("0.01")
BUCKETS = ("0-30", "31-60", "61-90", "90+")


def _q(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT)


def bucket_for(age_ref: date, as_of: date) -> str:
    days = (as_of - age_ref).days
    return BUCKETS[0] if days <= 30 else BUCKETS[1] if days <= 60 else BUCKETS[2] if days <= 90 else BUCKETS[3]


def build_ledger(documents: list[dict], payments: list[dict], writeoffs: list[dict], date_from: date, date_to: date) -> dict:
    """Pure ledger maths: opening balance, running balance, closing balance, totals and aging as at `date_to`."""
    events: list[dict] = []
    for d in documents:
        events.append({"date": d["issue_date"], "type": "invoice", "doc": d["id"], "reference": d["reference"],
                       "description": "Original amount", "debit": _q(Decimal(str(d["original"])) * d["rate"]), "credit": Decimal(0)})
    for p in payments:
        events.append({"date": p["date"], "type": "payment", "doc": p["doc"], "reference": p["reference"],
                       "description": p["description"], "debit": Decimal(0), "credit": _q(p["amount"])})
    for w in writeoffs:
        events.append({"date": w["date"], "type": "write_off", "doc": w["doc"], "reference": w["reference"],
                       "description": w["description"], "debit": Decimal(0), "credit": _q(w["amount"])})
    # Documents carry their own paid total; any payment not visible in the payment table (legacy rows) is shown, not hidden.
    by_doc: dict = {}
    for e in events:
        by_doc.setdefault(e["doc"], Decimal(0))
        by_doc[e["doc"]] += e["debit"] - e["credit"]
    for d in documents:
        expected = _q(Decimal(str(d["outstanding"])) * d["rate"])
        gap = _q(by_doc.get(d["id"], Decimal(0)) - expected)
        if date_to >= datetime.now(UTC).date() and gap != 0:
            events.append({"date": d["issue_date"], "type": "payment", "doc": d["id"], "reference": d["reference"],
                           "description": "Other settlements recorded on the document", "debit": Decimal(0) if gap > 0 else -gap,
                           "credit": gap if gap > 0 else Decimal(0)})
    events = [e for e in events if e["date"] <= date_to]
    order = {"invoice": 0, "payment": 1, "write_off": 2}
    events.sort(key=lambda e: (e["date"], order[e["type"]], e["reference"]))
    opening = sum((e["debit"] - e["credit"] for e in events if e["date"] < date_from), Decimal(0))
    running, rows = opening, []
    totals = {"billed": Decimal(0), "paid": Decimal(0), "written_off": Decimal(0)}
    for e in events:
        if e["date"] < date_from:
            continue
        running += e["debit"] - e["credit"]
        totals["billed"] += e["debit"]
        if e["type"] == "payment":
            totals["paid"] += e["credit"]
        elif e["type"] == "write_off":
            totals["written_off"] += e["credit"]
        rows.append({**e, "balance": running})
    closing = running
    aging = dict.fromkeys(BUCKETS, Decimal(0))
    balances: dict = {}
    for e in events:
        balances[e["doc"]] = balances.get(e["doc"], Decimal(0)) + e["debit"] - e["credit"]
    for d in documents:
        left = balances.get(d["id"], Decimal(0))
        if left > 0:
            aging[bucket_for(d["age_ref"], date_to)] += left
    return {"opening": opening, "closing": closing, "rows": rows, "totals": {**totals, "outstanding": closing}, "aging": aging}


async def statement(db: AsyncSession, user: User, kind: str, active: uuid.UUID | None, party_id: uuid.UUID,
                    date_from: date | None, date_to: date | None) -> dict:
    tenant, branch, currency = await context(db, user, kind, active)
    today = datetime.now(UTC).date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=365))
    if date_from > date_to:
        raise ValidationError("From date must be on or before the to date")
    repo = DebtRepository(db)
    projection = repo.projection(tenant, kind, currency, branch, today).subquery()
    docs = [dict(r) for r in (await db.execute(
        select(projection).where(projection.c.party_id == party_id, projection.c.issue_date <= date_to)
        .order_by(projection.c.issue_date, projection.c.reference))).mappings()]
    party = await _party(db, tenant, kind, party_id)
    if party is None:
        raise NotFoundError("Party not found")
    ids = [d["id"] for d in docs]
    payments = await _payments(db, tenant, kind, docs, ids)
    writeoffs = []
    if ids:
        rows = (await db.execute(select(DebtAdjustment).where(
            DebtAdjustment.tenant_id == tenant, DebtAdjustment.kind == kind, DebtAdjustment.action == "write_off",
            DebtAdjustment.document_id.in_(ids)))).scalars().all()
        rates = {d["id"]: d for d in docs}
        writeoffs = [{"date": r.created_at.date(), "doc": r.document_id, "reference": rates[r.document_id]["reference"],
                      "amount": Decimal(r.amount) * rates[r.document_id]["rate"], "description": f"Written off: {r.reason}"}
                     for r in rows]
    ledger = build_ledger(docs, payments, writeoffs, date_from, date_to)
    return encoded({"kind": kind, "party": party, "currency": currency, "date_from": date_from, "date_to": date_to,
                    "branch_id": branch, **ledger})


async def _party(db, tenant, kind, party_id):
    if kind == "receivable":
        from app.modules.sales.models.customer import Customer
        row = (await db.execute(select(Customer.id, Customer.name, Customer.email).where(
            Customer.tenant_id == tenant, Customer.id == party_id))).first()
    else:
        from app.modules.inventory.models.supplier import Supplier
        row = (await db.execute(select(Supplier.id, Supplier.name, Supplier.email).where(
            Supplier.tenant_id == tenant, Supplier.id == party_id))).first()
    return {"id": row.id, "name": row.name, "email": row.email} if row else None


async def _payments(db, tenant, kind, docs, ids) -> list[dict]:
    if not ids:
        return []
    rate = {d["id"]: d["rate"] for d in docs}
    manual = {d["id"] for d in docs if d["is_manual"]}
    out: list[dict] = []
    if kind == "receivable":
        stmt = select(OrderPayment.order_id, OrderPayment.reference, OrderPayment.paid_at, OrderPayment.payment_method,
                      func.coalesce(OrderPayment.applied_amount, OrderPayment.amount).label("amt")).where(
            OrderPayment.tenant_id == tenant, OrderPayment.order_id.in_(ids), OrderPayment.status == "Completed")
    else:
        stmt = select(SupplierPayment.bill_id.label("order_id"), SupplierPayment.reference, SupplierPayment.paid_at,
                      SupplierPayment.payment_method,
                      func.coalesce(SupplierPayment.applied_amount, SupplierPayment.amount).label("amt")).where(
            SupplierPayment.tenant_id == tenant, SupplierPayment.bill_id.in_(ids))
    for r in (await db.execute(stmt)).all():
        out.append({"doc": r.order_id, "reference": r.reference, "date": r.paid_at.date(),
                    "amount": Decimal(r.amt) * rate[r.order_id], "description": f"Payment ({r.payment_method or 'n/a'})"})
    if manual:
        for r in (await db.execute(select(ManualDebtPayment).where(
                ManualDebtPayment.tenant_id == tenant, ManualDebtPayment.debt_id.in_(manual)))).scalars():
            out.append({"doc": r.debt_id, "reference": r.reference, "date": r.paid_at.date(),
                        "amount": Decimal(r.amount) * rate[r.debt_id], "description": f"Payment ({r.payment_method or 'n/a'})"})
    return out
