"""Read-only traceability, precise audits, branch scope and posting semantics."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.period import DatePeriod
from app.modules.audit.models import AuditLog
from app.modules.inventory.models.product import Product
from app.modules.inventory.schemas.product import ProductUpdate, RestockRequest
from app.modules.inventory.service.history import product_details, product_history
from app.modules.inventory.service.product import restock_product, update_product
from app.modules.procurement.models.goods_receipt import GoodsReceipt, GoodsReceiptLine
from app.modules.procurement.models.purchase_item import PurchaseItem
from app.modules.procurement.models.purchase_order import PurchaseOrder
from app.modules.sales.models.order import Order
from app.modules.sales.models.order_item import OrderItem
from app.modules.sales.models.return_ import Return
from app.modules.sales.models.return_item import ReturnItem
from tests.test_access_management import business, client, plan


@pytest.fixture
async def sample(db, monkeypatch):
    plan(monkeypatch, "inventory", "sales", "procurement")
    tenant, _, owner, employee, a, b = await business(db, "Trace")
    p = Product(tenant_id=tenant.id, name="Tracked product", stock=10, price=100, cost=60)
    db.add(p)
    await db.flush()
    for branch, qty, status in [(a, 3, "Completed"), (b, 7, "Completed"), (a, 20, "Cancelled")]:
        order = Order(
            tenant_id=tenant.id,
            order_number=uuid.uuid4().hex,
            branch_id=branch.id,
            status=status,
            created_by=owner.id,
        )
        db.add(order)
        await db.flush()
        line = OrderItem(
            order_id=order.id,
            product_id=p.id,
            product_name=p.name,
            quantity=qty,
            unit_price=100,
            line_total=qty * 100,
        )
        db.add(line)
        await db.flush()
        if branch == a and status == "Completed":
            returned = Return(
                tenant_id=tenant.id,
                order_id=order.id,
                return_number=uuid.uuid4().hex,
                return_date=datetime.now(UTC).date(),
                status="Approved",
                processed_by=owner.id,
            )
            db.add(returned)
            await db.flush()
            db.add(
                ReturnItem(
                    return_id=returned.id,
                    order_item_id=line.id,
                    product_id=p.id,
                    product_name=p.name,
                    quantity=1,
                    refund_per_unit=100,
                    line_refund=100,
                )
            )
    po = PurchaseOrder(
        tenant_id=tenant.id, reference=uuid.uuid4().hex, branch_id=a.id, status="PartiallyReceived"
    )
    db.add(po)
    await db.flush()
    item = PurchaseItem(
        purchase_order_id=po.id,
        product_id=p.id,
        product_name=p.name,
        quantity=10,
        received_quantity=2,
        unit_cost=60,
        line_total=600,
        stock_factor=3,
    )
    receipt = GoodsReceipt(
        tenant_id=tenant.id,
        purchase_order_id=po.id,
        branch_id=a.id,
        reference=uuid.uuid4().hex,
        request_fingerprint="x",
        client_reference=uuid.uuid4().hex,
        received_by=owner.id,
        amount=120,
    )
    db.add_all([item, receipt])
    await db.flush()
    db.add(GoodsReceiptLine(receipt_id=receipt.id, purchase_item_id=item.id, quantity=2))
    db.add(
        AuditLog(
            tenant_id=tenant.id,
            actor_user_id=owner.id,
            action="purchase.receive",
            entity_type="purchase",
            entity_id=str(po.id),
            summary="Received purchase",
            changes={
                "price_changes": [
                    {
                        "product_id": str(p.id),
                        "variant_id": None,
                        "previous_cost": "50",
                        "new_cost": "60",
                        "previous_price": "90",
                        "new_price": "100",
                    }
                ]
            },
        )
    )
    await db.flush()
    await db.refresh(employee, ["role_rel"])
    await db.refresh(employee.role_rel, ["permissions"])
    return tenant, owner, employee, a, b, p


@pytest.mark.db
async def test_totals_receipts_filtering_pagination_do_not_mutate_stock(db, sample):
    _, owner, _, a, _, p = sample
    detail = await product_details(db, owner, p.id)
    assert detail["total_sold"] == 9
    assert detail["current_stock"] == 10
    result = await product_history(db, owner, p.id, DatePeriod())
    assert result["total"] == 8
    assert next(r for r in result["items"] if r["type"] == "purchase")["quantity_change"] is None
    assert next(r for r in result["items"] if r["type"] == "receipt")["quantity_change"] == 6
    price = next(r for r in result["items"] if r["type"] == "purchase_price")
    assert price["details"]["changes"]["before"]["price"] == "90"
    assert price["details"]["changes"]["after"]["cost"] == "60"
    assert (
        await product_history(db, owner, p.id, DatePeriod(), category="prices", branch_id=a.id)
    )["total"] == 1
    assert (await product_history(db, owner, p.id, DatePeriod(), search=price["reference"]))[
        "total"
    ] == 2
    assert (
        await product_history(
            db, owner, p.id, DatePeriod(from_date=datetime.now(UTC).date() + timedelta(days=2))
        )
    )["total"] == 0
    first = await product_history(db, owner, p.id, DatePeriod(), limit=2)
    second = await product_history(db, owner, p.id, DatePeriod(), offset=2, limit=2)
    assert len(first["items"]) == len(second["items"]) == 2
    assert not ({r["id"] for r in first["items"]} & {r["id"] for r in second["items"]})
    await db.refresh(p)
    assert p.stock == 10


@pytest.mark.db
async def test_audit_before_after_and_atomic_adjustments(db, sample):
    tenant, owner, _, _, _, p = sample
    await update_product(db, tenant.id, p.id, ProductUpdate(price=120, name="Updated"), actor=owner)
    await restock_product(
        db, tenant.id, p.id, RestockRequest(qty=4, reason="Count verified"), actor=owner
    )
    await restock_product(
        db, tenant.id, p.id, RestockRequest(qty=12, mode="adjust", reason="Recount"), actor=owner
    )
    records = (
        await db.scalars(
            select(AuditLog).where(
                AuditLog.tenant_id == tenant.id,
                AuditLog.entity_type == "product",
                AuditLog.entity_id == str(p.id),
            )
        )
    ).all()
    assert len(records) == 4
    price = next(r for r in records if r.action == "product.price")
    assert Decimal(str(price.changes["before"]["price"])) == 100
    assert Decimal(str(price.changes["after"]["price"])) == 120
    assert all(r.actor_user_id == owner.id for r in records)
    await db.refresh(p)
    assert p.stock == 12


@pytest.mark.db
async def test_branch_tenant_isolation_and_api(db, sample):
    _, owner, employee, a, b, p = sample
    restricted = await product_details(db, employee, p.id)
    assert restricted["current_stock"] is None
    assert restricted["total_sold"] == 2
    result = await product_history(db, employee, p.id, DatePeriod())
    assert all(r["branch_id"] == a.id for r in result["items"])
    with pytest.raises(ForbiddenError):
        await product_history(db, employee, p.id, DatePeriod(), branch_id=b.id)
    with pytest.raises(NotFoundError):
        await product_details(db, owner, uuid.uuid4())
    async with client(db, owner) as api:
        response = await api.get(f"/api/v1/tenants/inventory/products/{p.id}/history?page_size=2")
        assert response.status_code == 200, response.text
        assert len(response.json()["data"]["items"]) == 2
        details = await api.get(
            f"/api/v1/tenants/inventory/products/{p.id}/details", headers={"X-Branch-Id": str(a.id)}
        )
        assert details.status_code == 200, details.text
        assert details.json()["data"]["current_stock"] is None
        assert details.json()["data"]["total_sold"] == 2
        exported = await api.get(
            f"/api/v1/tenants/inventory/products/{p.id}/history?export_csv=true&category=prices"
        )
        assert exported.status_code == 200, exported.text
        assert "text/csv" in exported.headers["content-type"]
        assert "90" in exported.text and "100" in exported.text
        assert exported.text.count("\n") == 2


@pytest.mark.db
async def test_disabled_sources_and_branch_export_do_not_leak(db, sample):
    _, owner, employee, _a, b, p = sample
    other_branch = (await product_history(db, owner, p.id, DatePeriod(), branch_id=b.id))["items"][
        0
    ]["reference"]
    async with client(db, employee) as api:
        exported = await api.get(
            f"/api/v1/tenants/inventory/products/{p.id}/history?export_csv=true"
        )
        assert exported.status_code == 200
        assert other_branch not in exported.text
        denied = await api.get(
            f"/api/v1/tenants/inventory/products/{p.id}/history?export_csv=true&branch_id={b.id}"
        )
        assert denied.status_code == 403
    employee.disabled_modules = ["sales", "procurement"]
    hidden = await product_history(db, employee, p.id, DatePeriod())
    assert not any(row["source"] in ("sale", "purchase") for row in hidden["items"])
    assert (await product_details(db, employee, p.id))["total_sold"] is None


@pytest.mark.db
async def test_return_linked_to_variant_line_and_tenant_boundaries(db, sample):
    from app.modules.inventory.models.variant import ProductVariant

    tenant, owner, _, a, _, p = sample
    variant = ProductVariant(product_id=p.id, stock=8, attributes={"size": "large"})
    db.add(variant)
    await db.flush()
    order = Order(
        tenant_id=tenant.id, order_number=uuid.uuid4().hex, branch_id=a.id, status="Completed"
    )
    db.add(order)
    await db.flush()
    item = OrderItem(
        order_id=order.id,
        product_id=None,
        variant_id=variant.id,
        product_name=p.name,
        quantity=2,
        unit_price=100,
        line_total=200,
    )
    db.add(item)
    await db.flush()
    returned = Return(
        tenant_id=tenant.id,
        order_id=order.id,
        return_number=uuid.uuid4().hex,
        return_date=datetime.now(UTC).date(),
        status="Approved",
    )
    db.add(returned)
    await db.flush()
    db.add(
        ReturnItem(
            return_id=returned.id,
            order_item_id=item.id,
            product_id=None,
            product_name=p.name,
            quantity=1,
            refund_per_unit=100,
            line_refund=100,
        )
    )
    await db.flush()
    assert (await product_details(db, owner, p.id))["total_sold"] == 10
    other, _, _, _, _, _ = await business(db, "Other")
    foreign = Product(tenant_id=other.id, name="Do not expose")
    db.add(foreign)
    await db.flush()
    with pytest.raises(NotFoundError):
        await product_details(db, owner, foreign.id)


def test_sales_kpi_query_has_no_purchasing_or_audit_dependency():
    from app.modules.inventory.repository.history import ProductHistoryRepository

    repo = ProductHistoryRepository(None)
    query = str(repo.events(uuid.uuid4(), uuid.uuid4(), {"sales"}, sales_only=True))
    assert "sales_orders" in query and "sales_returns" in query
    for unrelated in (
        "purchase_items",
        "procurement_goods_receipts",
        "audit_logs",
        "inventory_stock_transfers",
    ):
        assert unrelated not in query
