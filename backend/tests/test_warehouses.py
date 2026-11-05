"""Warehouses: the stock ledger, transfers between warehouses, counts, and that nothing changes for a business that never switches them on."""
import uuid

import pytest
from sqlalchemy import func, select, text

from app.main import app
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.warehouse import StockMovement
from tests.test_sales_team import API, team

INV = f"{API}/inventory"


async def total_in_ledger(db, tenant_id, product_id):
    return float((await db.execute(select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(StockMovement.tenant_id == tenant_id, StockMovement.product_id == product_id))).scalar_one())


async def on_hand(c, warehouse_id, product_id):
    rows = (await c.get(f"{INV}/stock-by-warehouse", params={"warehouse_id": warehouse_id})).json()["data"]["items"]
    return next((r["on_hand"] for r in rows if r["product_id"] == str(product_id)), 0)


@pytest.mark.db
async def test_a_business_that_never_switches_warehouses_on_is_untouched(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    try:
        async with client(owner) as c:
            assert (await c.get(f"{INV}/warehouses")).json()["data"] == {"enabled": False, "items": []}
            made = await c.post(f"{API}/sales/orders", json=sale(2))
            assert made.status_code == 201
        assert (await db.execute(select(func.count()).select_from(StockMovement).where(StockMovement.tenant_id == tenant.id))).scalar_one() == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_setup_receive_sale_and_transfer_keep_every_warehouse_and_the_total_in_step(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()
    try:
        async with client(ann) as c:  # no warehouse rights given: ordinary staff cannot run warehouses
            assert (await c.post(f"{INV}/warehouses/setup")).status_code == 403
            assert (await c.post(f"{INV}/warehouses", json={"name": "Nope"})).status_code == 403
        async with client(owner) as c:
            on = (await c.post(f"{INV}/warehouses/setup")).json()["data"]
            main = on["items"][0]
            assert main["code"] == "MAIN" and main["is_default"] and main["units_on_hand"] == 100
            assert (await c.post(f"{INV}/warehouses/setup")).json()["data"]["items"][0]["units_on_hand"] == 100  # switching on twice opens nothing twice
            second = (await c.post(f"{INV}/warehouses", json={"name": "Kigali depot", "address": "KG 7 Ave"})).json()["data"]
            assert second["code"] == "WH-001" and second["is_active"]
            dup = await c.post(f"{INV}/warehouses", json={"name": "Again", "code": "main"})
            assert dup.status_code == 409

            # goods arrive at the depot; a till sale (no warehouse named) is taken from the default
            recv = await c.post(f"{INV}/warehouses/{second['id']}/receive", json={"lines": [{"product_id": str(product.id), "quantity": 40}], "reference": "GRN-1"})
            assert recv.status_code == 201, recv.text
            assert (await c.post(f"{API}/sales/orders", json=sale(3))).status_code == 201
            assert await on_hand(c, main["id"], product.id) == 97 and await on_hand(c, second["id"], product.id) == 40
            kinds = {m["movement_type"] for m in (await c.get(f"{INV}/stock-movements", params={"warehouse_id": main["id"]})).json()["data"]["items"]}
            assert {"opening", "sale"} <= kinds

            # a transfer: nothing leaves until dispatch, nothing arrives until receipt, the business total never changes
            body = {"from_warehouse_id": main["id"], "to_warehouse_id": second["id"], "items": [{"product_id": str(product.id), "product_name": "Widget", "quantity": 10}]}
            t = (await c.post(f"{INV}/transfers", json=body)).json()["data"]
            assert t["status"] == "pending" and t["from_warehouse_name"] == "Main warehouse"
            assert await on_hand(c, main["id"], product.id) == 97
            assert (await c.patch(f"{INV}/transfers/{t['id']}", json={"status": "in_transit"})).status_code == 200
            assert await on_hand(c, main["id"], product.id) == 87 and await on_hand(c, second["id"], product.id) == 40  # on the road
            assert (await c.patch(f"{INV}/transfers/{t['id']}", json={"status": "completed"})).status_code == 200
            assert await on_hand(c, main["id"], product.id) == 87 and await on_hand(c, second["id"], product.id) == 50
            assert (await c.patch(f"{INV}/transfers/{t['id']}", json={"status": "completed"})).status_code == 422  # a repeat moves nothing more
            assert await on_hand(c, second["id"], product.id) == 50
            too_many = {**body, "items": [{"product_id": str(product.id), "product_name": "Widget", "quantity": 500}]}
            big = (await c.post(f"{INV}/transfers", json=too_many)).json()["data"]
            assert (await c.patch(f"{INV}/transfers/{big['id']}", json={"status": "in_transit"})).status_code == 422
            same = await c.post(f"{INV}/transfers", json={**body, "to_warehouse_id": main["id"]})
            assert same.status_code == 422

            # cancelling a transfer on the road brings the stock back
            t2 = (await c.post(f"{INV}/transfers", json={**body, "items": [{"product_id": str(product.id), "product_name": "Widget", "quantity": 7}]})).json()["data"]
            await c.patch(f"{INV}/transfers/{t2['id']}", json={"status": "in_transit"})
            assert await on_hand(c, main["id"], product.id) == 80
            await c.patch(f"{INV}/transfers/{t2['id']}", json={"status": "cancelled"})
            assert await on_hand(c, main["id"], product.id) == 87

            # the warehouses always add up to the product total
            await db.refresh(product)
            assert float(product.stock) == 137 and await total_in_ledger(db, tenant.id, product.id) == 137
            # history is complete and cannot be rewritten
            types = {m["movement_type"] for m in (await c.get(f"{INV}/stock-movements", params={"product_id": str(product.id)})).json()["data"]["items"]}
            assert {"opening", "receipt", "sale", "transfer_out", "transfer_in"} <= types
            with pytest.raises(Exception, match="append-only"):
                async with db.begin_nested():
                    await db.execute(text("UPDATE inventory_stock_movements SET quantity = 1 WHERE tenant_id = :t"), {"t": tenant.id})
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_warehouse_with_stock_or_unfinished_work_cannot_be_deactivated(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()
    try:
        async with client(owner) as c:
            main = (await c.post(f"{INV}/warehouses/setup")).json()["data"]["items"][0]
            depot = (await c.post(f"{INV}/warehouses", json={"name": "Depot"})).json()["data"]
            assert (await c.post(f"{INV}/warehouses/{main['id']}/deactivate")).status_code == 409  # the default
            await c.post(f"{INV}/warehouses/{depot['id']}/receive", json={"lines": [{"product_id": str(product.id), "quantity": 5}]})
            blocked = await c.post(f"{INV}/warehouses/{depot['id']}/deactivate")
            assert blocked.status_code == 409 and "still holds" in blocked.json()["message"]
            t = (await c.post(f"{INV}/transfers", json={"from_warehouse_id": depot["id"], "to_warehouse_id": main["id"], "items": [{"product_id": str(product.id), "product_name": "Widget", "quantity": 5}]})).json()["data"]
            await c.patch(f"{INV}/transfers/{t['id']}", json={"status": "completed"})
            assert (await c.post(f"{INV}/warehouses/{depot['id']}/deactivate")).json()["data"]["is_active"] is False
            assert (await c.post(f"{INV}/warehouses/{depot['id']}/receive", json={"lines": [{"product_id": str(product.id), "quantity": 1}]})).status_code == 409
            assert (await c.post(f"{INV}/warehouses/{depot['id']}/activate")).json()["data"]["is_active"] is True
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_stock_count_changes_nothing_until_someone_else_approves_it(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()
    try:
        async with client(owner) as c:
            main = (await c.post(f"{INV}/warehouses/setup")).json()["data"]["items"][0]
            made = await c.post(f"{INV}/stock-counts", json={"warehouse_id": main["id"], "lines": [{"product_id": str(product.id), "counted_quantity": 96}], "note": "Monthly count"})
            assert made.status_code == 201, made.text
            count = made.json()["data"]
            assert count["status"] == "Submitted" and count["lines"][0]["expected"] == 100 and count["lines"][0]["difference"] == -4
            await db.refresh(product)
            assert float(product.stock) == 100
            dup = await c.post(f"{INV}/stock-counts", json={"warehouse_id": main["id"], "lines": [{"product_id": str(product.id), "counted_quantity": 1}, {"product_id": str(product.id), "counted_quantity": 2}]})
            assert dup.status_code == 422
            assert (await c.post(f"{INV}/stock-counts/{count['id']}/reject", json={})).status_code == 422  # a reason is needed
        async with client(ann) as c:
            assert (await c.post(f"{INV}/stock-counts/{count['id']}/approve", json={})).status_code == 403
        async with client(owner) as c:
            done = await c.post(f"{INV}/stock-counts/{count['id']}/approve", json={"note": "Checked on site"})
            assert done.status_code == 200 and done.json()["data"]["status"] == "Approved"
            await db.refresh(product)
            assert float(product.stock) == 96 and await on_hand(c, main["id"], product.id) == 96
            assert (await c.post(f"{INV}/stock-counts/{count['id']}/approve", json={})).status_code == 409  # approved once, applied once
            await db.refresh(product)
            assert float(product.stock) == 96
            kinds = {m["movement_type"] for m in (await c.get(f"{INV}/stock-movements", params={"product_id": str(product.id)})).json()["data"]["items"]}
            assert "count" in kinds
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_warehouses_belong_to_one_business(db, monkeypatch):
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    try:
        async with client(owner) as c:
            main = (await c.post(f"{INV}/warehouses/setup")).json()["data"]["items"][0]
            assert (await c.patch(f"{INV}/warehouses/{uuid.uuid4()}", json={"name": "x"})).status_code == 404
            assert (await c.get(f"{INV}/stock-counts/{uuid.uuid4()}")).status_code == 404
        other = await team(db, monkeypatch)
        async with other[4](other[3]) as c:
            assert (await c.patch(f"{INV}/warehouses/{main['id']}", json={"name": "Hijacked"})).status_code == 404
            assert (await c.get(f"{INV}/warehouses")).json()["data"]["enabled"] is False
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_actions_with_no_body_work_when_the_app_marks_them_as_json(db, monkeypatch):
    """The real app sends Content-Type: application/json on every request, even ones with nothing in the body."""
    tenant, ann, ben, owner, client, sale = await team(db, monkeypatch)
    product = (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()
    json_header = {"Content-Type": "application/json"}
    try:
        async with client(owner) as c:
            setup = await c.post(f"{INV}/warehouses/setup", headers=json_header)
            assert setup.status_code == 201, setup.text
            depot = (await c.post(f"{INV}/warehouses", json={"name": "Depot"})).json()["data"]
            for action in ("deactivate", "activate", "make-default"):
                r = await c.post(f"{INV}/warehouses/{depot['id']}/{action}", headers=json_header)
                assert r.status_code == 200, (action, r.text)
            assert product is not None
    finally:
        app.dependency_overrides.clear()
