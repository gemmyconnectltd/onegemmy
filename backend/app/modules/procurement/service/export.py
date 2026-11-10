import csv
import io
import uuid
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.procurement.repository.purchase import PurchaseOrderRepository


def _cell(value: object) -> str:
    text = str(value or "")
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


async def purchase_csv(db: AsyncSession, tenant_id: uuid.UUID, status: str | None,
                       **filters) -> AsyncIterator[str]:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Reference", "Supplier", "Branch", "Order date", "Expected delivery", "Status", "Currency", "Total"])
    yield "\ufeff" + buffer.getvalue()
    offset = 0
    while True:
        rows = await PurchaseOrderRepository(db).list_for_tenant(tenant_id, status, offset, 100, **filters)
        if not rows:
            break
        buffer.seek(0)
        buffer.truncate()
        from app.modules.tenants.repository import BranchRepository
        branches = await BranchRepository(db).names_for_ids(tenant_id, {row.branch_id for row in rows if row.branch_id})
        for row in rows:
            writer.writerow([_cell(row.reference), _cell(row.supplier.name if row.supplier else ""),
                _cell(branches.get(row.branch_id, "")), row.order_date or row.created_at.date(), row.expected_date,
                row.status, row.currency_code, row.total])
        yield buffer.getvalue()
        offset += len(rows)


async def purchase_pdf(db: AsyncSession, tenant_id: uuid.UUID, purchase_id: uuid.UUID) -> tuple[str, str]:
    """Reuse the bounded financial PDF writer; isolate blocking rendering in a worker."""
    import asyncio
    import os
    import tempfile
    from datetime import UTC, datetime

    from app.core.exceptions import NotFoundError
    from app.modules.accounting.service.workspace_export import ExportWriter
    from app.modules.currency.service import get_base_currency
    from app.modules.tenants.repository import TenantRepository

    purchase = await PurchaseOrderRepository(db).get_by_id_for_tenant(tenant_id, purchase_id)
    if purchase is None:
        raise NotFoundError("Purchase not found")
    tenant = await TenantRepository(db).get(tenant_id)
    today = datetime.now(UTC).date().isoformat()
    report = {"id": str(purchase.id), "title": f"Purchase Order {purchase.reference}",
        "business": tenant.name, "currency": purchase.currency_code or await get_base_currency(db, tenant_id),
        "branch": f"Supplier: {purchase.supplier.name if purchase.supplier else 'Not specified'}",
        "from_date": str(purchase.order_date or purchase.created_at.date()),
        "to_date": str(purchase.expected_date or "Not specified"), "as_of": today,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "columns": [{"key": key, "label": label, "kind": kind} for key, label, kind in [
            ("name", "Product / service", "text"), ("sku", "SKU", "text"),
            ("quantity", "Ordered", "number"), ("received", "Received", "number"),
            ("cost", "Unit cost (inclusive)", "money"), ("total", "Line total", "money")]],
        "totals": {"Subtotal": str(purchase.subtotal), "Discount": str(purchase.discount),
                   "Additional tax": str(purchase.tax), "Grand total": str(purchase.total)},
        "notes": [f"Order status: {purchase.status}. This is a purchase commitment, not a payment receipt.",
                  purchase.notes or "", purchase.delivery_instructions or ""]}
    rows = [{"name": item.product_name, "sku": item.sku, "quantity": item.quantity,
             "received": item.received_quantity, "cost": item.unit_cost, "total": item.line_total}
            for item in purchase.items]
    with tempfile.NamedTemporaryFile(prefix="pesaa-purchase-", suffix=".pdf", delete=False) as file:
        path = file.name
    try:
        def render() -> None:
            writer = ExportWriter(path, "pdf", report, tenant)
            writer.rows(rows)
            writer.finish()
        await asyncio.to_thread(render)
    except BaseException:
        os.unlink(path)
        raise
    return path, f"{purchase.reference}.pdf"
