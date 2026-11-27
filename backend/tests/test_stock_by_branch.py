"""Stock by branch: one catalogue, every branch keeps its own stock in its own warehouse, and a branch only ever shows its own.

Kigali (the main branch, Main warehouse) 22 widgets, Kayonza 3, Huye 0. Every scenario number refers to the specification."""
import uuid
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, func, select

from app.core.security import create_access_token
from app.main import app
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.warehouse import StockMovement, Warehouse
from app.modules.inventory.service.stock_ledger import ensure_branch_warehouses
from app.modules.tenants.models import Branch, Role, User
from app.modules.tenants.service.role import ensure_permissions_seeded
from tests.test_sales_team import API, team

INV = f"{API}/inventory"
pytestmark = pytest.mark.db


async def _books(db, monkeypatch):
    tenant, _ann, _ben, owner, _client, sale = await team(db, monkeypatch)
    widget = (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()  # 100 in stock, min_stock 0
    widget.min_stock = 4
    kigali = (await db.execute(select(Branch).where(Branch.tenant_id == tenant.id, Branch.is_main.is_(True)))).scalar_one()
    kayonza, huye = Branch(tenant_id=tenant.id, name="Kayonza"), Branch(tenant_id=tenant.id, name="Huye")
    everything = Role(tenant_id=tenant.id, name="Branch Stock Keeper", permissions=list(await ensure_permissions_seeded(db)))
    db.add_all([kayonza, huye, everything])
    await db.flush()
    keeper = User(tenant_id=tenant.id, full_name="Kayonza Keeper", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                  is_superuser=False, role="member", role_id=everything.id, branch_id=kayonza.id, branch_ids=[str(kayonza.id)])
    huye_cashier = User(tenant_id=tenant.id, full_name="Huye Cashier", email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                        is_superuser=False, role="member", role_id=everything.id, branch_id=huye.id, branch_ids=[str(huye.id)])
    db.add_all([keeper, huye_cashier])
    await db.flush()

    def client(user, branch=None):
        token = create_access_token(str(user.id), {"tenant_id": str(tenant.id)})
        headers = {"Authorization": f"Bearer {token}"}
        if branch is not None:
            headers["X-Branch-Id"] = str(branch.id)
        return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers=headers)

    async with client(owner, kigali) as c:
        listed = (await c.post(f"{INV}/warehouses/setup")).json()["data"]["items"]
        wh = {w["branch_id"]: w["id"] for w in listed}
        assert set(wh) == {str(kigali.id), str(kayonza.id), str(huye.id)}  # every branch got a warehouse of its own
        # Kigali holds 100 in Main; move 3 to Kayonza and keep 22 in Kigali by selling the rest out of the picture
        t = await c.post(f"{INV}/transfers", json={"from_warehouse_id": wh[str(kigali.id)], "to_warehouse_id": wh[str(kayonza.id)],
                                                   "items": [{"product_id": str(widget.id), "product_name": "Widget", "quantity": 3}]})
        await c.patch(f"{INV}/transfers/{t.json()['data']['id']}", json={"status": "completed"})
        assert (await c.post(f"{API}/sales/orders", json=sale(75))).status_code == 201
    return {"tenant": tenant, "owner": owner, "keeper": keeper, "huye_cashier": huye_cashier, "client": client, "sale": sale, "widget": widget,
            "kigali": kigali, "kayonza": kayonza, "huye": huye, "wh": {"kigali": wh[str(kigali.id)], "kayonza": wh[str(kayonza.id)], "huye": wh[str(huye.id)]}}


async def _held(db, warehouse_id, product_id) -> float:
    return float((await db.execute(select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
        StockMovement.warehouse_id == uuid.UUID(str(warehouse_id)), StockMovement.product_id == product_id))).scalar_one())


def _row(items, name):
    return next(r for r in items if r["name"] == name)


async def test_all_branches_total_is_the_sum_of_the_branches(db, monkeypatch):  # scenario 3
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:
            body = (await c.get(f"{INV}/branches/summary", params={"page_size": 50})).json()["data"]
            items, totals = body["items"], body["summary"]["totals"]
            assert {r["name"]: r["units"] for r in items} == {"Main": 22, "Kayonza": 3, "Huye": 0}
            assert totals["units"] == 25 == sum(r["units"] for r in items)
            assert totals["value_cost"] == 25 * 50 and _row(items, "Kayonza")["value_retail"] == 300
            products = (await c.get(f"{INV}/products", params={"page_size": 100})).json()["data"]["items"]
            assert next(p["stock"] for p in products if p["id"] == str(s["widget"].id)) == 25
    finally:
        app.dependency_overrides.clear()


async def test_picking_kayonza_shows_kayonza_only_everywhere(db, monkeypatch):  # scenarios 4 and 16
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["owner"], s["kayonza"]) as c:
            products = (await c.get(f"{INV}/products", params={"page_size": 100})).json()["data"]["items"]
            assert next(p["stock"] for p in products if p["id"] == str(s["widget"].id)) == 3
            one = (await c.get(f"{INV}/products/{s['widget'].id}")).json()["data"]
            assert one["stock"] == 3
            valuation = (await c.get(f"{INV}/reports/valuation")).json()["data"]
            assert float(valuation["summary"]["total_units"]) == 3
            rows = (await c.get(f"{INV}/stock-by-warehouse")).json()["data"]["items"]
            assert {r["warehouse_id"] for r in rows} == {s["wh"]["kayonza"]}
            moves = (await c.get(f"{INV}/stock-movements")).json()["data"]["items"]
            assert {m["warehouse_id"] for m in moves} == {s["wh"]["kayonza"]}
            export = await c.get(f"{INV}/reports/valuation/export", params={"format": "csv"})
            assert export.status_code == 200
            import csv
            import io
            units = next(r for r in csv.reader(io.StringIO(export.text)) if r and r[0] == "Total Units")
            assert float(units[1]) == 3  # Kayonza's 3, not the business's 25
    finally:
        app.dependency_overrides.clear()


async def test_a_kayonza_keeper_cannot_read_kigali_even_with_a_forged_header(db, monkeypatch):  # scenario 5
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["keeper"], s["kigali"]) as c:  # forged X-Branch-Id
            assert (await c.get(f"{INV}/products")).status_code == 403
            assert (await c.get(f"{INV}/reports/valuation")).status_code == 403
            assert (await c.get(f"{INV}/stock-by-warehouse", params={"warehouse_id": s["wh"]["kigali"]})).status_code == 403
        async with s["client"](s["keeper"]) as c:
            products = (await c.get(f"{INV}/products", params={"page_size": 100})).json()["data"]["items"]
            assert next(p["stock"] for p in products if p["id"] == str(s["widget"].id)) == 3
            assert (await c.get(f"{INV}/stock-by-warehouse", params={"warehouse_id": s["wh"]["kigali"]})).status_code == 403
            summary = (await c.get(f"{INV}/branches/summary")).json()["data"]
            assert [r["name"] for r in summary["items"]] == ["Kayonza"] and summary["summary"]["totals"]["units"] == 3
            mine = (await c.get(f"{INV}/products/{s['widget'].id}/stock-by-branch")).json()["data"]
            assert [r["name"] for r in mine["items"]] == ["Kayonza"]
            refused = await c.put(f"{INV}/products/{s['widget'].id}/stock-by-branch/{s['kigali'].id}", json={"reorder_level": 9})
            assert refused.status_code == 403
    finally:
        app.dependency_overrides.clear()


async def test_a_branch_without_its_own_warehouse_never_sells_another_branchs_stock(db, monkeypatch):  # scenario 6
    s = await _books(db, monkeypatch)
    try:
        # before the migration: Huye has no warehouse at all (its own is removed here), Kayonza's is someone else's
        await db.execute(Warehouse.__table__.delete().where(Warehouse.id == uuid.UUID(s["wh"]["huye"])))
        await db.flush()
        async with s["client"](s["huye_cashier"]) as c:
            till = (await c.get(f"{INV}/products", params={"for_sale": True, "page_size": 100})).json()["data"]["items"]
            assert next(p["stock"] for p in till if p["id"] == str(s["widget"].id)) == 0
            refused = await c.post(f"{API}/sales/orders", json=s["sale"](1))
            assert refused.status_code == 422 and "no warehouse of its own" in refused.text
        assert await _held(db, s["wh"]["kayonza"], s["widget"].id) == 3 and await _held(db, s["wh"]["kigali"], s["widget"].id) == 22
        made = await ensure_branch_warehouses(db, s["tenant"].id)  # what the migration and branch creation do
        assert [w.name for w in made] == ["Huye warehouse"]
    finally:
        app.dependency_overrides.clear()


async def test_a_shortfall_is_never_taken_from_another_branch(db, monkeypatch):
    s = await _books(db, monkeypatch)
    try:
        from app.core import stock_context
        stock_context.current_branch_id.set(s["kayonza"].id)
        s["widget"].stock = float(s["widget"].stock) - 5  # 5 out in Kayonza, which holds 3
        await db.flush()
        stock_context.current_branch_id.set(None)
        assert await _held(db, s["wh"]["kayonza"], s["widget"].id) == -2  # visibly short in Kayonza
        assert await _held(db, s["wh"]["kigali"], s["widget"].id) == 22  # Kigali untouched
    finally:
        app.dependency_overrides.clear()


async def test_a_transfer_leaves_on_dispatch_and_arrives_on_receipt(db, monkeypatch):  # scenario 9
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:
            t = (await c.post(f"{INV}/transfers", json={"from_warehouse_id": s["wh"]["kigali"], "to_warehouse_id": s["wh"]["kayonza"],
                                                        "items": [{"product_id": str(s["widget"].id), "product_name": "Widget", "quantity": 10}]})).json()["data"]
            await c.patch(f"{INV}/transfers/{t['id']}", json={"status": "in_transit"})
            summary = {r["name"]: r for r in (await c.get(f"{INV}/branches/summary")).json()["data"]["items"]}
            assert summary["Main"]["units"] == 12 and summary["Kayonza"]["units"] == 3  # on the way counts in no branch
            assert summary["Kayonza"]["incoming_units"] == 10 and summary["Kayonza"]["incoming_transfers"] == [t["transfer_number"]]
            await c.patch(f"{INV}/transfers/{t['id']}", json={"status": "completed"})
            summary = {r["name"]: r for r in (await c.get(f"{INV}/branches/summary")).json()["data"]["items"]}
            assert summary["Kayonza"]["units"] == 13 and summary["Kayonza"]["incoming_units"] == 0
    finally:
        app.dependency_overrides.clear()


async def test_low_stock_uses_each_branchs_own_reorder_level(db, monkeypatch):  # scenario 10
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:
            summary = {r["name"]: r for r in (await c.get(f"{INV}/branches/summary")).json()["data"]["items"]}
            assert summary["Kayonza"]["low"] == 1 and summary["Main"]["low"] == 0  # Kayonza 3 ≤ 4, Kigali 22 > 4
            assert summary["Huye"]["out"] == 0  # Huye never carried widgets: not "out"
            # Kigali raises its own level to 30: now low there only
            saved = await c.put(f"{INV}/products/{s['widget'].id}/stock-by-branch/{s['kigali'].id}", json={"reorder_level": 30})
            assert saved.status_code == 200, saved.text
            row = next(r for r in saved.json()["data"]["items"] if r["name"] == "Main")
            assert row["reorder_level"] == 30 and row["own_reorder_level"] and row["status"] == "low"
            listed = (await c.get(f"{INV}/products", params={"per_branch": True, "page_size": 100})).json()["data"]
            widget = next(p for p in listed["items"] if p["id"] == str(s["widget"].id))
            assert {c_["status"] for c_ in widget["branch_stock"]} >= {"low"} and widget["low_in_any"] and widget["held_in"] == 2
            assert [b["name"] for b in listed["summary"]["branches"]["branches"]] == ["Main", "Huye", "Kayonza"]
        async with s["client"](s["owner"], s["kigali"]) as c:
            low = (await c.get(f"{INV}/products/low-stock")).json()["data"]["items"]
            assert [(l["name"], l["min_stock"]) for l in low] == [("Widget", 30)]
        async with s["client"](s["owner"], s["kayonza"]) as c:
            low = (await c.get(f"{INV}/products/low-stock")).json()["data"]["items"]
            assert [(l["name"], l["stock"], l["min_stock"]) for l in low] == [("Widget", 3, 4)]
            cleared = await c.put(f"{INV}/products/{s['widget'].id}/stock-by-branch/{s['kigali'].id}", json={"use_product_reorder_level": True})
            assert next(r for r in cleared.json()["data"]["items"] if r["name"] == "Main")["reorder_level"] == 4
    finally:
        app.dependency_overrides.clear()


async def test_voids_and_returns_put_stock_back_where_the_sale_took_it(db, monkeypatch):  # scenario 13
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:  # give Huye 5 widgets
            t = (await c.post(f"{INV}/transfers", json={"from_warehouse_id": s["wh"]["kigali"], "to_warehouse_id": s["wh"]["huye"],
                                                        "items": [{"product_id": str(s["widget"].id), "product_name": "Widget", "quantity": 5}]})).json()["data"]
            await c.patch(f"{INV}/transfers/{t['id']}", json={"status": "completed"})
        async with s["client"](s["huye_cashier"]) as c:
            first = (await c.post(f"{API}/sales/orders", json=s["sale"](2))).json()["data"]
            second = (await c.post(f"{API}/sales/orders", json=s["sale"](1))).json()["data"]
        assert await _held(db, s["wh"]["huye"], s["widget"].id) == 2
        async with s["client"](s["owner"]) as c:  # "All branches": the ledger's own default would be Kigali's Main, yet it goes back to Huye
            voided = await c.post(f"{API}/sales/orders/{first['id']}/void", json={"reason": "rung up twice"})
            assert voided.status_code == 200, voided.text
            assert await _held(db, s["wh"]["huye"], s["widget"].id) == 4
            line = second["items"][0]
            returned = await c.post(f"{API}/sales/returns", json={
                "order_id": second["id"], "status": "Approved", "return_date": datetime.now(UTC).date().isoformat(),
                "items": [{"order_item_id": line["id"], "product_id": line["product_id"], "product_name": "Widget", "quantity": 1, "refund_per_unit": 100}]})
            assert returned.status_code == 201, returned.text
        assert await _held(db, s["wh"]["huye"], s["widget"].id) == 5 and await _held(db, s["wh"]["kigali"], s["widget"].id) == 17
    finally:
        app.dependency_overrides.clear()


async def test_a_branch_holding_stock_cannot_be_deactivated(db, monkeypatch):  # scenario 14
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:
            refused = await c.patch(f"{API}/branches/{s['kayonza'].id}", json={"status": "inactive"})
            assert refused.status_code == 422 and "Kayonza still holds 3 units" in refused.text and "Widget 3" in refused.text
            emptied = await c.patch(f"{API}/branches/{s['huye'].id}", json={"status": "inactive"})
            assert emptied.status_code == 200, emptied.text  # Huye holds nothing
    finally:
        app.dependency_overrides.clear()


async def test_a_new_branch_gets_its_own_warehouse(db, monkeypatch):
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:
            made = await c.post(f"{API}/branches", json={"name": "Musanze"})
            assert made.status_code in (200, 201), made.text
        names = (await db.execute(select(Warehouse.name).where(Warehouse.tenant_id == s["tenant"].id, Warehouse.branch_id == uuid.UUID(made.json()["data"]["id"])))).scalars().all()
        assert names == ["Musanze warehouse"]
    finally:
        app.dependency_overrides.clear()


async def test_twelve_branches_paginate_sort_and_stay_cheap(db, monkeypatch):  # scenario 15
    s = await _books(db, monkeypatch)
    try:
        db.add_all([Branch(tenant_id=s["tenant"].id, name=f"Branch {i:02d}") for i in range(9)])
        await db.flush()
        await ensure_branch_warehouses(db, s["tenant"].id)
        async with s["client"](s["owner"]) as c:
            first = (await c.get(f"{INV}/branches/summary", params={"page_size": 8, "sort": "units", "descending": True})).json()["data"]
            assert first["total"] == 12 and len(first["items"]) == 8 and first["summary"]["branch_count"] == 12
            assert [r["name"] for r in first["items"][:2]] == ["Main", "Kayonza"]
            second = (await c.get(f"{INV}/branches/summary", params={"page_size": 8, "page": 2, "sort": "units", "descending": True})).json()["data"]
            assert len(second["items"]) == 4
            statements = []
            listener = lambda *a: statements.append(a[2])
            event.listen(db.bind.sync_engine if hasattr(db.bind, "sync_engine") else db.bind, "before_cursor_execute", listener)
            try:
                listed = await c.get(f"{INV}/products", params={"per_branch": True, "page_size": 50})
            finally:
                event.remove(db.bind.sync_engine if hasattr(db.bind, "sync_engine") else db.bind, "before_cursor_execute", listener)
            assert listed.status_code == 200 and len(listed.json()["data"]["summary"]["branches"]["branches"]) == 12
            assert len(statements) < 30, len(statements)  # a fixed number of queries, not one per branch or product
    finally:
        app.dependency_overrides.clear()


async def test_needs_stock_names_the_branch_that_has_it(db, monkeypatch):
    s = await _books(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:
            body = (await c.get(f"{INV}/branches/needs-stock")).json()["data"]
            assert [(r["branch"], r["status"], r["on_hand"]) for r in body["items"]] == [("Kayonza", "low", 3)]
            assert body["items"][0]["sources"] == [{"branch_id": str(s["kigali"].id), "name": "Main", "quantity": 22}]
        async with s["client"](s["owner"], s["kigali"]) as c:
            assert (await c.get(f"{INV}/branches/needs-stock")).json()["data"]["items"] == []  # Kigali is fine
        async with s["client"](s["owner"]) as c:
            searched = (await c.get(f"{INV}/reports/valuation", params={"search": "widg"})).json()["data"]
            assert [l["name"] for l in searched["lines"]] == ["Widget"]
            assert (await c.get(f"{INV}/reports/valuation", params={"search": "nothing"})).json()["data"]["lines"] == []
    finally:
        app.dependency_overrides.clear()


async def test_product_filters_read_the_branch_being_viewed(db, monkeypatch):
    """"More filters" on Products: stock status counts the branch shown (Kayonza 3 is low against 4, Huye never carried it so it
    is not "out" there), and type / price narrow the catalogue."""
    s = await _books(db, monkeypatch)
    widget = str(s["widget"].id)

    async def ids(c, **params):
        r = await c.get(f"{INV}/products", params={"page_size": 100, **params})
        assert r.status_code == 200, r.text
        body = r.json()["data"]
        assert body["total"] == len(body["items"])
        return {p["id"] for p in body["items"]}
    try:
        async with s["client"](s["owner"], s["kayonza"]) as c:
            assert widget in await ids(c, stock="low") and widget in await ids(c, stock="in")
            assert widget not in await ids(c, stock="out")
        async with s["client"](s["owner"], s["huye"]) as c:
            assert widget not in await ids(c, stock="out") and widget not in await ids(c, stock="in")
        async with s["client"](s["owner"]) as c:  # all branches: 25 in total, above the level of 4
            assert widget in await ids(c, stock="in") and widget not in await ids(c, stock="low")
            assert widget in await ids(c, kind="simple") and widget not in await ids(c, kind="variants")
            price = float(s["widget"].price)
            assert widget in await ids(c, price_min=price, price_max=price) and widget not in await ids(c, price_min=price + 1)
            assert (await c.get(f"{INV}/products", params={"price_min": 10, "price_max": 5})).status_code in (400, 422)
    finally:
        app.dependency_overrides.clear()


async def test_products_can_show_one_branch_without_switching_the_top_bar(db, monkeypatch):
    """Products' own "View stock in" reads one branch's stock while the top bar stays on All branches; nobody sees a branch
    they are not allowed into."""
    s = await _books(db, monkeypatch)
    widget = str(s["widget"].id)
    try:
        async with s["client"](s["owner"]) as c:  # no branch in the top bar
            r = await c.get(f"{INV}/products", params={"page_size": 100, "stock": "low", "stock_branch": str(s["kayonza"].id)})
            assert r.status_code == 200 and widget in {p["id"] for p in r.json()["data"]["items"]}  # 3 in Kayonza, level 4
            r = await c.get(f"{INV}/products", params={"page_size": 100, "stock": "low"})
            assert widget not in {p["id"] for p in r.json()["data"]["items"]}  # 25 across the business
        async with s["client"](s["keeper"]) as c:
            r = await c.get(f"{INV}/products", params={"stock": "in", "stock_branch": str(s["huye"].id)})
            assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()
