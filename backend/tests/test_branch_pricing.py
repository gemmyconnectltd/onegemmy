"""Branch prices and availability (``Tenant.branch_pricing``), on a real database in a rolled-back transaction.

Covers who may do what (owner, Inventory Manager, Store Manager limited to one branch, cashier, Pesaa's self-service
setting), the price rules, hiding on every sale path, prices set by the server, keeping values across off/on, and that one
business never affects another. Test data is prefixed "QA-"."""
import uuid
from decimal import Decimal as D
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.core.security import create_access_token
from app.main import app
from app.modules.accounting.service.account import seed_default_accounts
from app.modules.audit.models import AuditLog
from app.modules.inventory.models.branch_setting import ProductBranchSetting
from app.modules.inventory.models.product import Product
from app.modules.inventory.schemas.branch_pricing import BranchPriceChange, BranchSettingIn
from app.modules.inventory.service import branch_pricing
from app.modules.inventory.service.product import count_products, list_products
from app.modules.sales.models.quotation import Quotation
from app.modules.sales.schemas import OrderCreate, OrderItemCreate, OrderUpdate
from app.modules.sales.schemas.quotation import QuotationCreate
from app.modules.sales.service import order as order_service
from app.modules.sales.service import quotation as quotation_service
from app.modules.tenants.models import Branch, Role, Tenant, User
from app.modules.tenants.service.role import ensure_permissions_seeded

pytestmark = pytest.mark.db
API = "/api/v1/tenants/inventory"


async def setup(db, *, enabled=True, self_service=True):
    t = Tenant(name=f"QA-T-{uuid.uuid4().hex[:6]}", slug=f"qa-{uuid.uuid4().hex[:10]}", currency="RWF", is_active=True,
               subscription_status="active", branch_pricing=enabled, branch_pricing_self_service=self_service, debt_limit_per_client=10**11)
    db.add(t)
    await db.flush()
    kigali = Branch(tenant_id=t.id, name="QA-Kigali", status="active", is_main=True)
    huye = Branch(tenant_id=t.id, name="QA-Huye", status="active")
    db.add_all([kigali, huye])
    await db.flush()
    catalog = {p.name: p for p in await ensure_permissions_seeded(db)}

    def role(name, *perms):
        return Role(tenant_id=t.id, name=f"QA-{name}", permissions=[catalog[p] for p in perms])
    inventory_role = role("Inventory Manager", "items:read", "items:update", "branch_prices:manage")
    store_role = role("Store Manager", "items:read", "pos:read", "branch_prices:manage")
    cashier_role = role("Cashier", "items:read", "pos:read", "pos:create", "orders:create")
    db.add_all([inventory_role, store_role, cashier_role])
    await db.flush()

    def person(name, **kw):
        return User(email=f"qa-{uuid.uuid4().hex[:8]}@test.local", hashed_password="x", full_name=f"QA-{name}", tenant_id=t.id, is_active=True, **kw)
    owner = person("Owner", role="owner", is_superuser=True)
    inventory = person("Inventory", role="member", role_id=inventory_role.id)
    store = person("Store", role="member", role_id=store_role.id, branch_id=huye.id)
    cashier = person("Cashier", role="member", role_id=cashier_role.id, branch_id=huye.id)
    db.add_all([owner, inventory, store, cashier])
    await db.flush()
    await seed_default_accounts(db, t.id)
    paper = Product(id=uuid.uuid4(), tenant_id=t.id, name="QA-A4 paper", sku=f"QA-P-{uuid.uuid4().hex[:6]}", barcode=f"QA{uuid.uuid4().hex[:8]}",
                    price=5000, cost=3600, stock=100)
    banner = Product(id=uuid.uuid4(), tenant_id=t.id, name="QA-Banner", sku=f"QA-B-{uuid.uuid4().hex[:6]}", price=30000, cost=18000, stock=10)
    db.add_all([paper, banner])
    await db.flush()
    return SimpleNamespace(t=t, kigali=kigali, huye=huye, owner=owner, inventory=inventory, store=store, cashier=cashier, paper=paper, banner=banner)


def sale(product, price, **extra):
    return OrderCreate(status="Completed", amount_paid=price, payment_method="cash",
                       items=[OrderItemCreate(product_id=product.id, product_name=product.name, unit_price=price, quantity=1)], **extra)


@pytest.fixture
def client(db):
    async def session():
        yield db
    app.dependency_overrides[get_db] = session

    def make(user, branch=None):
        headers = {"Authorization": f"Bearer {create_access_token(str(user.id), {'tenant_id': str(user.tenant_id)})}"}
        if branch is not None:
            headers["X-Branch-Id"] = str(branch.id)
        return AsyncClient(transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://t", headers=headers)
    yield make
    app.dependency_overrides.clear()


def change(product, branch, **kw):
    return {"changes": [{"product_id": str(product.id), "branch_id": str(branch.id), **kw}]}


# ── Who can do what ──────────────────────────────────────────────────────────

async def test_owner_switches_it_and_manages_every_branch(db, client):
    s = await setup(db, enabled=False)
    async with client(s.owner) as c:
        status = (await c.get(f"{API}/branch-pricing/status")).json()["data"]
        assert status["enabled"] is False and status["can_toggle"] is True
        assert (await c.put(f"{API}/branch-pricing/status", json={"enabled": True})).status_code == 200
        for branch in (s.kigali, s.huye):
            r = await c.put(f"{API}/branch-prices", json=change(s.paper, branch, price=5600))
            assert r.status_code == 200, r.text
    log = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == s.t.id, AuditLog.action == "tenant.branch_pricing"))).scalar_one()
    assert log.actor_user_id == s.owner.id and log.changes == {"before": {"branch_pricing": False}, "after": {"branch_pricing": True}}


async def test_inventory_manager_manages_every_branch_but_cannot_switch_it(db, client):
    s = await setup(db)
    async with client(s.inventory) as c:
        for branch in (s.kigali, s.huye):
            assert (await c.put(f"{API}/branch-prices", json=change(s.paper, branch, price=5600))).status_code == 200
        refused = await c.put(f"{API}/branch-pricing/status", json={"enabled": False})
        assert refused.status_code == 403
    assert (await db.get(Tenant, s.t.id)).branch_pricing is True


async def test_store_manager_changes_only_their_own_branch(db, client):
    s = await setup(db)
    async with client(s.store) as c:
        assert (await c.put(f"{API}/branch-prices", json=change(s.paper, s.huye, price=5600))).status_code == 200
        other = await c.put(f"{API}/branch-prices", json=change(s.paper, s.kigali, price=5600))
        assert other.status_code == 403 and other.json()["message"] == "You can only change prices for QA-Huye"
        product = await c.put(f"{API}/products/{s.paper.id}/branches", json={"branches": [{"branch_id": str(s.kigali.id), "is_available": False}]})
        assert product.status_code == 403
        rows = (await c.get(f"{API}/products/{s.paper.id}/branches")).json()["data"]["branches"]
        assert {r["branch_name"]: r["editable"] for r in rows} == {"QA-Kigali": False, "QA-Huye": True}


async def test_cashier_sees_prices_at_the_till_but_cannot_manage_them(db, client):
    s = await setup(db)
    await branch_pricing.bulk_set(db, s.owner, [BranchPriceChange(product_id=s.paper.id, branch_id=s.huye.id, price=D(5600))])
    async with client(s.cashier) as c:
        till = (await c.get(f"{API}/products", params={"for_sale": True, "page_size": 50})).json()["data"]["items"]
        assert next(p["price"] for p in till if p["id"] == str(s.paper.id)) == 5600
        assert (await c.get(f"{API}/branch-prices")).status_code == 403
        assert (await c.get(f"{API}/products/{s.paper.id}/branches")).status_code == 403
        assert (await c.put(f"{API}/branch-prices", json=change(s.paper, s.huye, price=5700))).status_code == 403
        assert (await c.put(f"{API}/branch-prices/visibility", json={"product_ids": [str(s.paper.id)], "branch_id": str(s.huye.id), "visible": False})).status_code == 403
        status = (await c.get(f"{API}/branch-pricing/status")).json()["data"]
        assert status["can_manage"] is False and status["can_toggle"] is False and status["editable_branch_ids"] == []


async def test_pesaa_can_stop_the_business_switching_it(db, client):
    s = await setup(db, enabled=False, self_service=False)
    async with client(s.owner) as c:
        assert (await c.get(f"{API}/branch-pricing/status")).json()["data"]["can_toggle"] is False
        refused = await c.put(f"{API}/branch-pricing/status", json={"enabled": True})
        assert refused.status_code == 403 and "Pesaa" in refused.json()["message"]
    assert (await db.get(Tenant, s.t.id)).branch_pricing is False


async def test_the_new_permission_is_in_the_catalogue(db):
    names = {p.name for p in await ensure_permissions_seeded(db)}
    assert "branch_prices:manage" in names


# ── Price rules ──────────────────────────────────────────────────────────────

async def test_below_cost_zero_negative_and_variant_prices_are_refused(db):
    s = await setup(db)
    with pytest.raises(ValidationError, match=r"^Price for QA-Huye \(RWF 3,000\) is below cost \(RWF 3,600\)\.$"):
        await branch_pricing.set_product_branches(db, s.owner, s.paper.id, [BranchSettingIn(branch_id=s.huye.id, price=D(3000))])
    for bad in (D(0), D(-5)):
        with pytest.raises(ValidationError, match="must be more than RWF 0"):
            await branch_pricing.set_product_branches(db, s.owner, s.paper.id, [BranchSettingIn(branch_id=s.huye.id, price=bad)])
    s.paper.has_variants = True
    await db.flush()
    with pytest.raises(ValidationError, match="Branch prices aren't supported for products with variants yet"):
        await branch_pricing.set_product_branches(db, s.owner, s.paper.id, [BranchSettingIn(branch_id=s.huye.id, price=D(6000))])
    await branch_pricing.set_product_branches(db, s.owner, s.paper.id, [BranchSettingIn(branch_id=s.huye.id, is_available=False)])  # hiding still works
    assert await branch_pricing.hidden_products(db, s.t.id, s.huye.id, {s.paper.id}) == {s.paper.id}


async def test_own_price_and_hiding_per_branch_with_history(db):
    s = await setup(db)
    result = await branch_pricing.set_product_branches(db, s.owner, s.paper.id, [
        BranchSettingIn(branch_id=s.huye.id, price=D(5500)),
        BranchSettingIn(branch_id=s.kigali.id, price=D(5000)),  # same as the default: stays "follows default"
    ])
    rows = {r["branch_name"]: r for r in result["branches"]}
    assert rows["QA-Huye"]["price"] == 5500 and rows["QA-Kigali"]["price"] is None and rows["QA-Kigali"]["effective_price"] == 5000
    await branch_pricing.set_product_branches(db, s.owner, s.banner.id, [BranchSettingIn(branch_id=s.huye.id, is_available=False)])
    huye_items = await list_products(db, s.t.id, available_in=s.huye.id)
    assert [i.name for i in huye_items] == ["QA-A4 paper"] and await count_products(db, s.t.id, available_in=s.huye.id) == 1
    await branch_pricing.apply_prices(db, s.t.id, s.huye.id, huye_items)
    assert huye_items[0].price == 5500 and huye_items[0].default_price == 5000 and huye_items[0].branch_price
    history = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == s.t.id, AuditLog.action == "product.branch_price",
                                                       AuditLog.entity_id == str(s.paper.id)))).scalars().all()
    assert len(history) == 1 and history[0].actor_user_id == s.owner.id
    assert history[0].changes["branches"][0] == {"branch_id": str(s.huye.id), "branch": "QA-Huye", "before": {"sold": True, "price": "default"},
                                                 "after": {"sold": True, "price": 5500.0}}
    await branch_pricing.set_product_branches(db, s.owner, s.paper.id, [BranchSettingIn(branch_id=s.huye.id, price=None)])
    assert (await db.execute(select(func.count()).select_from(ProductBranchSetting).where(ProductBranchSetting.product_id == s.paper.id))).scalar_one() == 0


async def test_bulk_hide_keeps_the_branch_price(db):
    s = await setup(db)
    await branch_pricing.bulk_set(db, s.owner, [BranchPriceChange(product_id=s.paper.id, branch_id=s.huye.id, price=D(5500))])
    assert await branch_pricing.set_visibility(db, s.owner, [s.paper.id, s.banner.id], s.huye.id, False) == 2
    assert await branch_pricing.hidden_products(db, s.t.id, s.huye.id, {s.paper.id, s.banner.id}) == {s.paper.id, s.banner.id}
    await branch_pricing.set_visibility(db, s.owner, [s.paper.id], s.huye.id, True)
    assert await branch_pricing.branch_prices(db, s.t.id, s.huye.id, {s.paper.id}) == {s.paper.id: D("5500.00")}


# ── Selling ──────────────────────────────────────────────────────────────────

async def test_a_hidden_product_is_refused_on_every_sale_path(db, client):
    s = await setup(db)
    # A quotation and an open order made before it was hidden.
    quote = await quotation_service.create_quotation(db, s.t.id, s.owner.id, "QA-Owner", QuotationCreate(
        branch_id=s.huye.id, items=[OrderItemCreate(product_id=s.banner.id, product_name=s.banner.name, unit_price=30000, quantity=1)]), s.huye.id)
    pending = await order_service.create_order(db, s.t.id, s.owner.id, sale(s.banner, 30000).model_copy(update={"status": "Pending", "amount_paid": 0}),
                                               active_branch_id=s.huye.id)
    await branch_pricing.set_product_branches(db, s.owner, s.banner.id, [BranchSettingIn(branch_id=s.huye.id, is_available=False)])
    for extra in ({"pricing_channel": "pos"}, {}):  # the till, and Sales → New sale
        with pytest.raises(ValidationError, match="Not sold in this branch: QA-Banner"):
            await order_service.create_order(db, s.t.id, s.owner.id, sale(s.banner, 30000, **extra), active_branch_id=s.huye.id)
    (await db.get(Quotation, quote.id)).status = "Accepted"
    await db.flush()
    with pytest.raises(ValidationError, match="Not sold in this branch"):
        await quotation_service.convert_quotation(db, s.t.id, quote.id, s.owner.id, "QA-Owner", s.huye.id)
    with pytest.raises(ValidationError, match="Not sold in this branch"):
        await order_service.update_order(db, s.t.id, pending.id, OrderUpdate(status="Completed"), s.owner.id, "QA-Owner", can_approve_sale=True)
    async with client(s.cashier) as c:  # the API, and the till's search and barcode scan
        r = await c.post("/api/v1/tenants/sales/orders", json={"status": "Completed", "payment_method": "cash", "amount_paid": 30000,
                                                               "items": [{"product_id": str(s.banner.id), "product_name": "x", "unit_price": 30000, "quantity": 1}]})
        assert r.status_code == 422 and "Not sold in this branch" in r.json()["message"]
        till = (await c.get(f"{API}/products", params={"for_sale": True, "search": "QA-Banner"})).json()["data"]["items"]
        assert till == []
    await branch_pricing.set_product_branches(db, s.owner, s.paper.id, [BranchSettingIn(branch_id=s.huye.id, is_available=False)])
    async with client(s.cashier) as c:
        scan = await c.get(f"{API}/products/barcode/{s.paper.barcode}")
        assert scan.status_code == 404 and scan.json()["message"] == "Not sold in this branch"
    # Elsewhere it still sells.
    assert (await order_service.create_order(db, s.t.id, s.owner.id, sale(s.banner, 30000), active_branch_id=s.kigali.id)).status == "Completed"


async def test_the_server_sets_the_price_not_the_client(db):
    s = await setup(db)
    await branch_pricing.bulk_set(db, s.owner, [BranchPriceChange(product_id=s.paper.id, branch_id=s.huye.id, price=D(5600))])
    huye = await order_service.create_order(db, s.t.id, s.owner.id, sale(s.paper, 4000).model_copy(update={"amount_paid": 5600}), active_branch_id=s.huye.id)
    assert float(huye.items[0].unit_price) == 5600 and float(huye.total) == 5600
    kigali = await order_service.create_order(db, s.t.id, s.owner.id, sale(s.paper, 4500).model_copy(update={"amount_paid": 5000}), active_branch_id=s.kigali.id)
    assert float(kigali.items[0].unit_price) == 5000  # the default price there
    assert float((await db.get(Product, s.paper.id)).price) == 5000  # the default price itself is never changed


# ── Switching and isolation ──────────────────────────────────────────────────

async def test_switching_off_and_on_keeps_saved_values(db, client):
    s = await setup(db)
    await branch_pricing.bulk_set(db, s.owner, [BranchPriceChange(product_id=s.paper.id, branch_id=s.huye.id, price=D(5600)),
                                                BranchPriceChange(product_id=s.banner.id, branch_id=s.huye.id, is_available=False)])
    async with client(s.owner) as c:
        await c.put(f"{API}/branch-pricing/status", json={"enabled": False})
        assert (await c.get(f"{API}/branch-prices")).status_code == 403
    off = await order_service.create_order(db, s.t.id, s.owner.id, sale(s.banner, 30000), active_branch_id=s.huye.id)
    assert off.status == "Completed"  # off: everything sells everywhere at default prices
    async with client(s.owner) as c:
        await c.put(f"{API}/branch-pricing/status", json={"enabled": True})
        data = (await c.get(f"{API}/branch-prices")).json()["data"]
        assert data["summary"]["with_own_price"] == 1 and data["summary"]["hidden_somewhere"] == 1


async def test_one_business_never_affects_another(db):
    s = await setup(db, enabled=True)
    other = await setup(db, enabled=False)
    await branch_pricing.bulk_set(db, s.owner, [BranchPriceChange(product_id=s.paper.id, branch_id=s.huye.id, is_available=False)])
    assert (await db.get(Tenant, other.t.id)).branch_pricing is False
    with pytest.raises(ForbiddenError, match="switched off"):
        await branch_pricing.price_list(db, other.owner, 0, 20, None, "all")
    with pytest.raises(NotFoundError):
        await branch_pricing.set_product_branches(db, s.owner, other.paper.id, [BranchSettingIn(branch_id=s.huye.id, price=D(6000))])
    with pytest.raises(ValidationError, match="active branch"):
        await branch_pricing.set_product_branches(db, s.owner, s.paper.id, [BranchSettingIn(branch_id=other.huye.id, price=D(6000))])
    assert (await order_service.create_order(db, other.t.id, other.owner.id, sale(other.paper, 5000), active_branch_id=other.huye.id)).status == "Completed"


async def test_the_menu_flag_follows_the_business_switch(db):
    import json

    from app.modules.tenants.routes.tenant import get_current_tenant_entitlements
    s = await setup(db, enabled=False)
    features = json.loads((await get_current_tenant_entitlements(db, s.owner, None)).body)["data"]["features"]
    assert features["branch_pricing"] is False
    s.t.branch_pricing = True
    await db.flush()
    features = json.loads((await get_current_tenant_entitlements(db, s.owner, None)).body)["data"]["features"]
    assert features["inventory"] is True and features["branch_pricing"] is True


async def test_the_business_patch_cannot_flip_the_platform_flags(db):
    from app.modules.tenants.routes.tenant import update_tenant
    from app.modules.tenants.schemas.tenant import TenantUpdate
    s = await setup(db, enabled=False)
    for field in ({"branch_pricing": True}, {"branch_pricing_self_service": False}):
        with pytest.raises(ForbiddenError, match="Business Settings"):
            await update_tenant(s.t.id, TenantUpdate(**field), db, s.owner)
