"""Branch stock with warehouses: a branch sells only what its own warehouse holds, branch staff see their own transfers and stock, and
transfer history cannot be deleted. Mirrors the staging QA set-up (Main 25 / Kigali store 20 / Musanze 30 / Remera 25)."""
import uuid

import pytest
from sqlalchemy import select

from app.main import app
from app.modules.inventory.models.product import Product
from app.modules.inventory.models.warehouse import StockMovement
from app.modules.tenants.models import Branch, Role, User
from app.modules.tenants.service.role import ensure_permissions_seeded
from tests.test_sales_team import API, team

INV = f"{API}/inventory"


async def _setup(db, monkeypatch):
    tenant, _ann, _ben, owner, client, sale = await team(db, monkeypatch)
    widget = (await db.execute(select(Product).where(Product.tenant_id == tenant.id))).scalars().first()  # 100 in stock
    hammer = Product(tenant_id=tenant.id, name="Hammer", price=10, cost=5, stock=2880)
    musanze, remera, huye = (Branch(tenant_id=tenant.id, name=n) for n in ("Musanze", "Remera", "Huye"))
    manager_role = Role(tenant_id=tenant.id, name="Branch Manager", permissions=list(await ensure_permissions_seeded(db)))
    db.add_all([hammer, musanze, remera, huye, manager_role])
    await db.flush()

    def staff(name, branch):
        return User(tenant_id=tenant.id, full_name=name, email=f"{uuid.uuid4().hex}@example.test", hashed_password="x", is_active=True,
                    is_superuser=False, role="member", role_id=manager_role.id, branch_id=branch.id)
    manager, huye_cashier = staff("Musanze Manager", musanze), staff("Huye Cashier", huye)
    db.add_all([manager, huye_cashier])
    await db.flush()
    main_branch = (await db.execute(select(Branch).where(Branch.tenant_id == tenant.id, Branch.is_main.is_(True)))).scalar_one()

    async with client(owner) as c:
        listed = (await c.post(f"{INV}/warehouses/setup")).json()["data"]["items"]
        main = listed[0]
        # switching warehouses on gives every branch a warehouse of its own; the main branch adds a second store
        own = {w["branch_id"]: w for w in listed if w["code"] != "MAIN"}
        assert {own[str(b.id)]["name"] for b in (musanze, remera, huye)} == {"Musanze warehouse", "Remera warehouse", "Huye warehouse"}
        made = await c.post(f"{INV}/warehouses", json={"name": "Kigali Store", "branch_id": str(main_branch.id)})
        assert made.status_code == 201, made.text
        wh = {"Kigali Store": made.json()["data"]["id"], "Musanze Warehouse": own[str(musanze.id)]["id"], "Remera Warehouse": own[str(remera.id)]["id"],
              "Huye": own[str(huye.id)]["id"]}
        transfers = {}
        for name, qty in (("Kigali Store", 20), ("Musanze Warehouse", 30), ("Remera Warehouse", 25)):
            t = await c.post(f"{INV}/transfers", json={"from_warehouse_id": main["id"], "to_warehouse_id": wh[name],
                                                       "items": [{"product_id": str(widget.id), "product_name": "Widget", "quantity": qty}]})
            assert t.status_code == 201, t.text
            transfers[name] = t.json()["data"]
            assert (await c.patch(f"{INV}/transfers/{transfers[name]['id']}", json={"status": "completed"})).status_code == 200
    return dict(tenant=tenant, owner=owner, manager=manager, huye=huye_cashier, client=client, sale=sale, widget=widget, hammer=hammer,
                main=main["id"], wh=wh, transfers=transfers, musanze=musanze)


async def _on_hand(c, warehouse_id, product_id):
    rows = (await c.get(f"{INV}/stock-by-warehouse", params={"warehouse_id": warehouse_id})).json()["data"]["items"]
    return next((r["on_hand"] for r in rows if r["product_id"] == str(product_id)), 0)


def _stock(items, product):
    return next(p["stock"] for p in items if p["id"] == str(product.id))


@pytest.mark.db
async def test_branch_pos_sells_only_from_its_own_warehouse(db, monkeypatch):
    s = await _setup(db, monkeypatch)
    try:
        async with s["client"](s["manager"]) as c:
            till = (await c.get(f"{INV}/products", params={"for_sale": True, "page_size": 100})).json()["data"]["items"]
            assert _stock(till, s["widget"]) == 30 and _stock(till, s["hammer"]) == 0  # 1. the till shows Musanze's stock, not the business total

            sold = await c.post(f"{API}/sales/orders", json=s["sale"](1))  # 2. a sale comes out of Musanze only
            assert sold.status_code == 201, sold.text
            assert await _on_hand(c, s["wh"]["Musanze Warehouse"], s["widget"].id) == 29
            moved = (await db.execute(select(StockMovement).where(StockMovement.reference_id == uuid.UUID(sold.json()["data"]["id"])))).scalars().all()
            assert [(str(m.warehouse_id), float(m.quantity), m.movement_type) for m in moved] == [(s["wh"]["Musanze Warehouse"], -1.0, "sale")]

            too_many = await c.post(f"{API}/sales/orders", json=s["sale"](30))  # 3. more than Musanze holds is refused, though the business has 99
            assert too_many.status_code == 422 and "Not enough" in too_many.text
            hammers = s["sale"](1)
            hammers["items"][0].update(product_id=str(s["hammer"].id), product_name="Hammer", unit_price=10)
            hammers.update(amount_paid=10, amount_tendered=10)
            assert (await c.post(f"{API}/sales/orders", json=hammers)).status_code == 422
        async with s["client"](s["owner"]) as c:
            assert await _on_hand(c, s["main"], s["widget"].id) == 25  # Main untouched

        async with s["client"](s["huye"]) as c:  # Huye has its own (empty) warehouse: it never sells Main's stock
            till = (await c.get(f"{INV}/products", params={"for_sale": True, "page_size": 100})).json()["data"]["items"]
            assert _stock(till, s["widget"]) == 0 and _stock(till, s["hammer"]) == 0
            refused = await c.post(f"{API}/sales/orders", json=s["sale"](1))
            assert refused.status_code == 422 and "Not enough" in refused.text
        async with s["client"](s["owner"]) as c:
            assert await _on_hand(c, s["main"], s["widget"].id) == 25
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_branch_staff_see_and_receive_their_own_transfers(db, monkeypatch):
    s = await _setup(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:
            incoming = (await c.post(f"{INV}/transfers", json={"from_warehouse_id": s["main"], "to_warehouse_id": s["wh"]["Musanze Warehouse"],
                                                               "items": [{"product_id": str(s["widget"].id), "product_name": "Widget", "quantity": 5}]})).json()["data"]
            assert incoming["from_branch_id"] and incoming["to_branch_id"] == str(s["musanze"].id)  # branch fields follow the warehouses
            assert (await c.patch(f"{INV}/transfers/{incoming['id']}", json={"status": "in_transit"})).status_code == 200
            in_transit = [r for r in (await c.get(f"{INV}/stock-by-warehouse", params={"warehouse_id": s["wh"]["Musanze Warehouse"]})).json()["data"]["items"]
                          if r["product_id"] == str(s["widget"].id)]
            assert in_transit[0]["in_transit"] == 5 and in_transit[0]["on_hand"] == 30  # units on the road are visible
            outgoing = (await c.post(f"{INV}/transfers", json={"from_warehouse_id": s["main"], "to_warehouse_id": s["wh"]["Remera Warehouse"],
                                                               "items": [{"product_id": str(s["widget"].id), "product_name": "Widget", "quantity": 1}]})).json()["data"]
        async with s["client"](s["manager"]) as c:
            seen = {t["id"] for t in (await c.get(f"{INV}/transfers")).json()["data"]["items"]}
            assert s["transfers"]["Musanze Warehouse"]["id"] in seen and incoming["id"] in seen  # 4. transfers into Musanze
            assert s["transfers"]["Kigali Store"]["id"] not in seen and s["transfers"]["Remera Warehouse"]["id"] not in seen
            assert (await c.get(f"{INV}/transfers/{s['transfers']['Remera Warehouse']['id']}")).status_code == 403
            assert (await c.patch(f"{INV}/transfers/{outgoing['id']}", json={"status": "in_transit"})).status_code == 403  # not their dispatch
            received = await c.patch(f"{INV}/transfers/{incoming['id']}", json={"status": "completed"})
            assert received.status_code == 200, received.text
            assert await _on_hand(c, s["wh"]["Musanze Warehouse"], s["widget"].id) == 35
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_moved_transfers_cannot_be_deleted_and_creation_checks_the_source(db, monkeypatch):
    s = await _setup(db, monkeypatch)
    try:
        async with s["client"](s["owner"]) as c:
            done = s["transfers"]["Kigali Store"]["id"]
            assert (await c.delete(f"{INV}/transfers/{done}")).status_code == 422  # 5. a completed transfer stays
            pending = (await c.post(f"{INV}/transfers", json={"from_warehouse_id": s["main"], "to_warehouse_id": s["wh"]["Kigali Store"],
                                                              "items": [{"product_id": str(s["widget"].id), "product_name": "Widget", "quantity": 1}]})).json()["data"]
            assert (await c.delete(f"{INV}/transfers/{pending['id']}")).status_code == 200  # one that never moved can go
        async with s["client"](s["manager"]) as c:
            assert (await c.delete(f"{INV}/transfers/{s['transfers']['Musanze Warehouse']['id']}")).status_code in (403, 422)
            body = {"from_warehouse_id": s["wh"]["Musanze Warehouse"], "to_warehouse_id": s["main"],
                    "items": [{"product_id": str(s["widget"].id), "product_name": "Widget", "quantity": 60}]}
            too_many = await c.post(f"{INV}/transfers", json=body)  # 7. refused when created, not only at dispatch
            assert too_many.status_code == 422 and "Not enough" in too_many.text
            body["items"][0]["quantity"] = 10
            assert (await c.post(f"{INV}/transfers", json=body)).status_code == 201  # their own warehouse can send
            assert (await c.post(f"{INV}/transfers", json={**body, "from_warehouse_id": s["main"], "to_warehouse_id": s["wh"]["Musanze Warehouse"]})).status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_inventory_views_are_scoped_to_the_branch(db, monkeypatch):
    s = await _setup(db, monkeypatch)
    musanze = s["wh"]["Musanze Warehouse"]
    try:
        async with s["client"](s["manager"]) as c:  # 6. only Musanze
            assert [w["id"] for w in (await c.get(f"{INV}/warehouses")).json()["data"]["items"]] == [musanze]
            rows = (await c.get(f"{INV}/stock-by-warehouse")).json()["data"]["items"]
            assert {r["warehouse_id"] for r in rows} == {musanze}
            assert (await c.get(f"{INV}/stock-by-warehouse", params={"warehouse_id": s["main"]})).status_code == 403
            assert {m["warehouse_id"] for m in (await c.get(f"{INV}/stock-movements")).json()["data"]["items"]} == {musanze}
            valuation = (await c.get(f"{INV}/reports/valuation")).json()["data"]
            assert float(valuation["summary"]["total_units"]) == 30
            products = (await c.get(f"{INV}/products", params={"page_size": 100})).json()["data"]["items"]
            assert _stock(products, s["widget"]) == 30
        async with s["client"](s["owner"]) as c:
            assert len((await c.get(f"{INV}/warehouses")).json()["data"]["items"]) == 5  # Main, Kigali Store and one per other branch
            products = (await c.get(f"{INV}/products", params={"page_size": 100})).json()["data"]["items"]
            assert _stock(products, s["widget"]) == 45  # acting in Main: Main 25 + Kigali Store 20, never Musanze's 30
            c.headers.pop("X-Branch-Id")  # "All branches": the whole business
            products = (await c.get(f"{INV}/products", params={"page_size": 100})).json()["data"]["items"]
            assert _stock(products, s["widget"]) == 100
            assert float((await c.get(f"{INV}/reports/valuation")).json()["data"]["summary"]["total_units"]) == 100 + 2880
    finally:
        app.dependency_overrides.clear()


@pytest.mark.db
async def test_a_new_products_starting_stock_is_an_opening_balance(db, monkeypatch):
    s = await _setup(db, monkeypatch)
    product = Product(tenant_id=s["tenant"].id, name="Fresh", price=5, cost=2, stock=12)
    db.add(product)
    await db.flush()
    kinds = (await db.execute(select(StockMovement.movement_type, StockMovement.quantity).where(StockMovement.product_id == product.id))).all()
    assert [(k, float(q)) for k, q in kinds] == [("opening", 12.0)]
