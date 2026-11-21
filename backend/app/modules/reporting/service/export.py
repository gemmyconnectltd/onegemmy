"""Branded exports (PDF, Excel, CSV) for every Business reports tab, built from the same server reports the screens use.

Each tab becomes one document: the business header (logo, contacts, TIN/VAT, brand colour) from the shared ExportWriter,
then titled sections ("Sales by branch", "Top products", ...) with bold total lines, the key figures and the definitions.
"""
import os
import tempfile
import uuid
from datetime import UTC, date, datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ValidationError
from app.modules.tenants.models import User

Kind = Literal["overview", "sales", "stock", "customers", "purchases", "finance", "team"]
TITLES = {"overview": "Business Overview", "sales": "Sales & Profitability", "stock": "Stock Report", "customers": "Customer Report",
          "purchases": "Purchases Report", "finance": "Finance Report", "team": "Team Performance"}
DIMENSION_LABELS = {"product": "Product", "category": "Category", "customer": "Customer", "branch": "Branch", "employee": "Salesperson", "payment": "Payment method"}


def col(key: str, label: str, kind: str = "text") -> dict:
    return {"key": key, "label": label, "kind": kind}


def heading(text: str) -> dict:
    return {"_heading": text}


def _f(value) -> float:
    return float(value or 0)


async def build(db: AsyncSession, user: User, kind: Kind, start: date | None, end: date | None, branch_id: uuid.UUID | None,
                dimension: str = "category") -> tuple[dict, list[dict]]:
    """The export for one report tab: (metadata for ExportWriter, rows with section headings)."""
    from app.modules.reporting.service import breakdowns
    from app.modules.reporting.service import performance as perf

    if kind == "overview":
        r = await perf.performance(db, user, start, end, branch_id, "previous")
        c, cmp = r["current"], (r["comparison"] or {})
        changes = cmp.get("changes", {}) if cmp.get("has_data") else {}
        change = lambda k: f'{changes[k]["percent"]:+}% vs {cmp["label"]}' if changes.get(k, {}).get("percent") is not None else ""
        columns = [col("name", "Item"), col("amount", "Amount", "money"), col("count", "Count", "number"), col("note", "Note")]
        rows = [heading("Key figures"),
                {"name": "Sales", "amount": c["sales"], "count": c["orders"], "note": change("sales")},
                {"name": "VAT", "amount": c["tax"]},
                {"name": "Cost of goods sold", "amount": c["cost_of_goods"], "note": "" if c["cost_of_goods"] is not None else "Some sold items have no cost"},
                {"name": "Gross profit", "amount": c["gross_profit"], "note": f'{c["gross_margin"]}% margin' if c["gross_margin"] is not None else ""},
                {"name": "Expenses", "amount": c["expenses"], "note": change("expenses") if r["can_see_expenses"] else "No access"},
                {"name": "Net profit", "amount": c["net_profit"], "note": change("net_profit"), "_total": True},
                {"name": "Returns refunded", "amount": c["returns"]},
                heading("Sales by branch"), *({"name": b["name"], "amount": b["sales"], "count": b["orders"]} for b in r["by_branch"]),
                heading("Sales by payment method"), *({"name": p["method"], "amount": p["sales"], "count": p["orders"]} for p in r["by_payment"]),
                heading("Top-selling products"), *({"name": p["name"], "amount": p["revenue"], "count": p["quantity"]} for p in r["top_products"])]
        position = [{"name": "Customers owe you (today)", "amount": r["receivables"]}] if r["receivables"] is not None else []
        if r["stock"]:
            position += [{"name": "Stock value at cost (today)", "amount": r["stock"]["valuation"]},
                         {"name": "Products low or out of stock", "count": r["stock"]["low_stock"], "note": f'{r["stock"]["out_of_stock"]} out of stock'}]
        if r.get("pipeline"):
            position += [{"name": f'Pipeline · {p["stage"]}', "amount": p["value"], "count": p["deals"]} for p in r["pipeline"]]
        if position:
            rows += [heading("Today's position"), *position]
        notes = list(r["definitions"].values())
        meta = {"from_date": r["from_date"], "to_date": r["to_date"], "currency": r["currency"], "columns": columns, "totals": {}, "notes": notes}
        return meta, rows

    if kind == "sales":
        r = await breakdowns.sales_breakdown(db, user, start, end, branch_id, dimension, limit=500)
        t = r["totals"]
        columns = [col("name", DIMENSION_LABELS.get(dimension, "Name")), col("orders", "Sales", "number"), col("quantity", "Quantity", "number"),
                   col("sales", "Sales value", "money"), col("cost", "Cost", "money"), col("gross_profit", "Gross profit", "money"), col("margin", "Margin %", "number")]
        rows = [heading(f"Sales by {DIMENSION_LABELS.get(dimension, dimension).lower()}"), *r["rows"]]
        totals = {"Sales (VAT included)": t["sales"], "Net sales (no VAT)": t["net_sales"], "Discounts given": t["discount"], "Returns refunded": t["returns"]}
        if t["gross_profit"] is not None:
            totals["Gross profit"] = t["gross_profit"]
        meta = {"from_date": r["from_date"], "to_date": r["to_date"], "currency": r["currency"], "columns": columns, "totals": totals, "notes": [r["note"]]}
        return meta, rows

    if kind in ("stock", "customers", "purchases"):
        r = await breakdowns.operations(db, user, start, end, branch_id)
        part = {"stock": "inventory", "customers": "customers", "purchases": "purchases"}[kind]
        d = r[part]
        if d is None:
            raise ValidationError("This report is not available for your role or this business")
        base = {"from_date": r["from_date"], "to_date": r["to_date"], "currency": r["currency"]}
        if kind == "stock":
            columns = [col("name", "Product"), col("stock", "In stock", "number"), col("min_stock", "Minimum", "number"), col("sold", "Sold", "number"), col("value", "Value at cost", "money")]
            rows = [heading("What to reorder (at or below minimum)"), *d["low"],
                    heading("Selling fastest"), *d["fast_moving"],
                    heading("Not selling (no sales in the period)"), *d["slow_moving"]]
            totals = {"Stock value at cost (today)": d["valuation"], "Active products": d["products"], "Low stock": d["low_stock"], "Out of stock": d["out_of_stock"]}
            return {**base, "columns": columns, "totals": totals, "quantity_totals": ["Active products", "Low stock", "Out of stock"], "notes": [d["note"]]}, rows
        if kind == "customers":
            columns = [col("name", "Customer"), col("orders", "Orders", "number"), col("sales", "Sales", "money")]
            rows = [heading("Top customers"), *d["top"]]
            totals = {"Customers who bought": d["buying_customers"], "New customers": d["new_customers"], "Returning customers": d["returning"]}
            if d["receivables"] is not None:
                totals["Customers owe you (today)"] = d["receivables"]
            return {**base, "columns": columns, "totals": totals, "quantity_totals": ["Customers who bought", "New customers", "Returning customers"],
                    "notes": ["Walk-in sales without a customer are not counted in customer figures."]}, rows
        columns = [col("name", "Supplier / status"), col("orders", "Orders", "number"), col("amount", "Amount", "money")]
        rows = [heading("Top suppliers"), *d["top_suppliers"], heading("Purchase orders by status"), *({"name": s["status"], **s} for s in d["by_status"])]
        return {**base, "columns": columns, "totals": {"Purchased": d["total"], "Purchase orders": d["orders"]}, "quantity_totals": ["Purchase orders"], "notes": []}, rows

    if kind == "finance":
        r = await breakdowns.financial(db, user, start, end, branch_id)
        m = r["metrics"]
        columns = [col("name", "Item"), col("detail", "Detail"), col("date", "Date", "date"), col("count", "Count", "number"), col("amount", "Amount", "money")]
        rows = [heading("Profit and loss"),
                {"name": "Net sales (no VAT)", "amount": m["net_sales"]}, {"name": "Cost of goods sold", "amount": m["cost_of_goods"]},
                {"name": "Gross profit", "amount": m["gross_profit"]}, {"name": "Approved expenses", "amount": m["expenses"]},
                {"name": "Net profit", "amount": m["net_profit"], "_total": True},
                heading("Expenses by category"), *({"name": c["name"], "detail": f'{c["share"]}% of expenses', "count": c["count"], "amount": c["amount"]} for c in r["by_category"]),
                heading("Expenses by branch"), *({"name": b["name"], "amount": b["amount"]} for b in r["by_branch"]),
                heading("Largest expenses"), *({"name": e["title"], "detail": e["category"], "date": e["date"], "amount": e["amount"]} for e in r["largest"])]
        totals = {"Approved expenses": r["expenses_total"], "Expenses waiting for approval": r["pending_expenses"]}
        if r["receivables"] is not None:
            totals["Customers owe you (today)"] = r["receivables"]
        return {"from_date": r["from_date"], "to_date": r["to_date"], "currency": r["currency"], "columns": columns, "totals": totals,
                "quantity_totals": ["Expenses waiting for approval"], "notes": ["Only approved expenses are counted in profit."]}, rows

    if kind == "team":
        from app.modules.reporting.service.salespeople import salespeople_report
        r = await salespeople_report(db, user, start, end, branch_id, include_rows=False)
        t = r["totals"]
        columns = [col("salesperson", "Salesperson"), col("orders", "Sales", "number"), col("sales", "Sales value", "money"), col("returns", "Returns", "money"),
                   col("net_sales", "Net sales", "money"), col("collected", "Collected", "money"), col("outstanding", "Still owed", "money")]
        rows = [heading("Sales per person"), *sorted(r["people"], key=lambda p: _f(p["sales"]), reverse=True),
                {"salesperson": "Team total", **t, "_total": True}]
        return {"from_date": r["from_date"], "to_date": r["to_date"], "currency": r["currency"], "columns": columns, "totals": {},
                "notes": list(r.get("definitions", {}).values())}, rows

    raise ValidationError("Unknown report")


def render(meta: dict, rows: list[dict], fmt: str, kind: Kind, tenant, branch_name: str | None) -> bytes:
    """Write the document with the business's branding and return its bytes."""
    from app.modules.accounting.service.workspace_export import ExportWriter
    report = {"id": f"report-{kind}", "kind": f"report-{kind}", "title": TITLES[kind], "business": getattr(tenant, "name", None) or "Business",
              "branch": branch_name or "All branches", "as_of": str(meta["to_date"]), "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
              **{k: (str(v) if k in ("from_date", "to_date") else v) for k, v in meta.items()}}
    with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as handle:
        path = handle.name
    try:
        writer = ExportWriter(path, fmt, report, tenant)
        writer.rows(rows)
        writer.finish()
        with open(path, "rb") as output:
            return output.read()
    finally:
        os.unlink(path)
